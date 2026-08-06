#!/usr/bin/env bash

# 服务器端部署脚本（随发布包上传，在 /opt/sku-table/current 下执行）
# 用法：./infra/scripts/remote-deploy.sh <版本号，如 0.1.4>
# 步骤：数据库备份 → 构建镜像 → 迁移 → 启动 → seed（如已配置）→ 健康检查

set -euo pipefail

VERSION="${1:?用法：remote-deploy.sh <版本号>}"
TAG="v${VERSION}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/infra/docker/docker-compose.yml"
ENV_FILE="${PROJECT_ROOT}/../state/.env"
COMPOSE=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "环境变量文件不存在：${ENV_FILE}" >&2
  echo "请确认发布目录在 /opt/sku-table/current 下，且 /opt/sku-table/state/.env 存在。" >&2
  exit 1
fi

# 从 .env 读取配置（docker compose 格式，支持引号包裹的值）
read_env() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "${ENV_FILE}" | tail -1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "${value}"
}

POSTGRES_USER="$(read_env POSTGRES_USER)"
POSTGRES_DB="$(read_env POSTGRES_DB)"
SEED_USER_EMAIL="$(read_env SEED_USER_EMAIL)"
SEED_USER_PASSWORD="$(read_env SEED_USER_PASSWORD)"
SEED_STUDIO_NAME="$(read_env SEED_STUDIO_NAME)"
APP_DOMAIN="$(read_env APP_DOMAIN)"

echo "==== 远程部署 ${TAG} ===="
echo "项目目录：${PROJECT_ROOT}"

# 1. 数据库备份（任何迁移或重建之前执行）
BACKUP_DIR="${PROJECT_ROOT}/../backups"
mkdir -p "${BACKUP_DIR}"
BACKUP_FILE="${BACKUP_DIR}/pre-${TAG}-$(date +%F_%H%M%S).sql"
"${COMPOSE[@]}" exec -T postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" > "${BACKUP_FILE}"
echo "[backup] 已备份数据库：${BACKUP_FILE}"

# 2. 构建镜像、执行迁移并启动服务（复用 deploy.sh）
"${SCRIPT_DIR}/deploy.sh" "${ENV_FILE}"

# 3. seed 初始化（幂等；未配置 SEED_USER_PASSWORD 时跳过，避免意外修改 owner 密码）
if [[ -n "${SEED_USER_EMAIL}" && -n "${SEED_USER_PASSWORD}" ]]; then
  echo "[seed] 初始化角色权限、默认工作室与 owner 账号"
  "${COMPOSE[@]}" run --rm --no-deps \
    -e "SEED_USER_EMAIL=${SEED_USER_EMAIL}" \
    -e "SEED_USER_PASSWORD=${SEED_USER_PASSWORD}" \
    -e "SEED_STUDIO_NAME=${SEED_STUDIO_NAME:-默认工作室}" \
    api node dist/db/seed.js
else
  echo "[seed] state/.env 未配置 SEED_USER_PASSWORD，跳过 seed（owner 密码不会被修改）。"
fi

# 4. 最终健康检查
HTTP_PORT="$(read_env HTTP_PORT)"
HTTP_PORT="${HTTP_PORT:-80}"
if [[ -n "${APP_DOMAIN}" ]]; then
  PAGE_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${APP_DOMAIN}" "http://127.0.0.1:${HTTP_PORT}/" || echo 000)"
  API_HEALTH="$(curl -s -H "Host: ${APP_DOMAIN}" "http://127.0.0.1:${HTTP_PORT}/api/health" || echo 'unreachable')"
else
  PAGE_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${HTTP_PORT}/" || echo 000)"
  API_HEALTH="$(curl -s "http://127.0.0.1:${HTTP_PORT}/api/health" || echo 'unreachable')"
fi
echo "[verify] 页面 HTTP ${PAGE_STATUS}，API 健康检查：${API_HEALTH}"
echo "==== 部署完成：${TAG} ===="
