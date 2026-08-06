#!/usr/bin/env bash

# 一键发布脚本（在本地开发机执行）
# 用法：
#   ./infra/scripts/release.sh 0.1.4             # 完整发布：改版本号 → 打标签 → 推 GitHub → 部署服务器
#   ./infra/scripts/release.sh --skip-git 0.1.4  # 跳过 git 操作，仅打包并部署当前代码（用于重试/演练）
#
# 服务器信息从 infra/scripts/.deploy.env 读取（不入库），示例见 .deploy.env.example

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SKIP_GIT=false
if [[ "${1:-}" == "--skip-git" ]]; then
  SKIP_GIT=true
  shift
fi

VERSION="${1:?用法：release.sh <版本号，如 0.1.4> [--skip-git]}"
VERSION="${VERSION#v}"
TAG="v${VERSION}"
BRANCH="release/${VERSION}"

# 校验版本号格式
if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "版本号格式不正确：${VERSION}，应为 x.y.z 形式。" >&2
  exit 1
fi

# 读取服务器部署配置
DEPLOY_ENV="${SCRIPT_DIR}/.deploy.env"
if [[ -f "${DEPLOY_ENV}" ]]; then
  # shellcheck disable=SC1090
  source "${DEPLOY_ENV}"
else
  echo "缺少部署配置：${DEPLOY_ENV}" >&2
  echo "请复制 .deploy.env.example 为 .deploy.env 并填写服务器信息。" >&2
  exit 1
fi

HOST="${SKU_TABLE_HOST:?未配置 SKU_TABLE_HOST（服务器 IP）}"
SSH_USER="${SKU_TABLE_SSH_USER:-root}"
SSH_KEY="${SKU_TABLE_SSH_KEY:?未配置 SKU_TABLE_SSH_KEY（密钥文件路径）}"
PROJECT_DIR="${SKU_TABLE_PROJECT_DIR:-/opt/sku-table}"

SSH_ARGS=(-i "${SSH_KEY}" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)
REMOTE="${SSH_USER}@${HOST}"
TARBALL="/tmp/sku-table-${TAG}.tar.gz"

echo "==== 开始发布 ${TAG} ===="

if [[ "${SKIP_GIT}" == "false" ]]; then
  # 1. 工作区必须干净，避免把未提交改动混进发布
  if ! git -C "${PROJECT_ROOT}" diff --quiet; then
    echo "工作区有未提交改动，请先提交或暂存（stash）。" >&2
    exit 1
  fi

  # 2. 更新全部 package.json 版本号
  for file in package.json apps/api/package.json apps/web/package.json packages/shared/package.json; do
    perl -pi -e "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" "${PROJECT_ROOT}/${file}"
  done
  if ! git -C "${PROJECT_ROOT}" diff --name-only -- package.json apps/api/package.json apps/web/package.json packages/shared/package.json | grep -q package.json; then
    echo "版本号没有变化，请确认当前版本不是 ${VERSION}。" >&2
    exit 1
  fi

  # 3. 提交、更新正式分支与标签
  git -C "${PROJECT_ROOT}" add package.json apps/api/package.json apps/web/package.json packages/shared/package.json
  git -C "${PROJECT_ROOT}" commit -m "chore: 升级版本号到 ${TAG}"
  git -C "${PROJECT_ROOT}" branch -f "${BRANCH}" HEAD
  git -C "${PROJECT_ROOT}" tag -f "${TAG}" HEAD

  # 4. 推送 main、正式分支与标签到 GitHub
  git -C "${PROJECT_ROOT}" push origin main
  git -C "${PROJECT_ROOT}" push origin "${BRANCH}"
  git -C "${PROJECT_ROOT}" push origin "${TAG}"
  echo "[git] 分支 ${BRANCH} 与标签 ${TAG} 已推送。"
else
  echo "[git] 已跳过 git 操作（--skip-git），使用当前 HEAD 打包。"
  TAG_HEAD="$(git -C "${PROJECT_ROOT}" rev-parse --short HEAD)"
  TAG="${TAG}-${TAG_HEAD}-skip"
  TARBALL="/tmp/sku-table-${TAG}.tar.gz"
  VERSION="${VERSION}"
fi

# 5. 打包源码（与服务器历史包名保持一致）
git -C "${PROJECT_ROOT}" archive --format=tar.gz -o "${TARBALL}" HEAD
echo "[pack] 已生成 ${TARBALL}"

# 6. 上传并远程部署
scp "${SSH_ARGS[@]}" "${TARBALL}" "${REMOTE}:${PROJECT_DIR}/releases/"
echo "[upload] 已上传到 ${REMOTE}:${PROJECT_DIR}/releases/"

ssh "${SSH_ARGS[@]}" "${REMOTE}" \
  "set -euo pipefail
   cd ${PROJECT_DIR}/releases
   mkdir -p \"v${VERSION}\"
   tar -xzf \"sku-table-${TAG}.tar.gz\" -C \"v${VERSION}\"
   ln -sfn \"${PROJECT_DIR}/releases/v${VERSION}\" \"${PROJECT_DIR}/current\"
   cd \"${PROJECT_DIR}/current\"
   ./infra/scripts/remote-deploy.sh \"${VERSION}\""

echo "==== 发布 ${VERSION} 完成 ===="
