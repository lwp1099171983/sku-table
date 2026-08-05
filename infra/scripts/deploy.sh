#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/infra/docker/docker-compose.yml"
ENV_FILE="${PROJECT_ROOT}/infra/docker/.env"

if [[ $# -gt 0 ]]; then
  ENV_FILE="$1"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 Docker，请先在服务器安装 Docker Engine 和 Compose 插件。" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "未找到 Docker Compose 插件。" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "环境变量文件不存在：${ENV_FILE}" >&2
  echo "请从 infra/docker/.env.example 创建并填写生产值。" >&2
  exit 1
fi

if grep -q 'replace-with-' "${ENV_FILE}"; then
  echo "${ENV_FILE} 仍包含占位凭据，请替换后再部署。" >&2
  exit 1
fi

compose=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

wait_for_healthy() {
  local service="$1"
  local container_id
  local health

  for _ in {1..30}; do
    container_id="$("${compose[@]}" ps -q "${service}")"
    if [[ -n "${container_id}" ]]; then
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}")"
      if [[ "${health}" == "healthy" ]]; then
        return 0
      fi
    fi
    sleep 4
  done

  echo "${service} 容器未在 120 秒内进入 healthy 状态。" >&2
  "${compose[@]}" logs --tail=100 "${service}" >&2
  return 1
}

echo "[1/4] 校验 Docker Compose 配置"
"${compose[@]}" config --quiet

echo "[2/4] 启动 PostgreSQL"
"${compose[@]}" pull postgres
"${compose[@]}" up -d postgres

echo "[3/4] 验证 PostgreSQL 健康、连接和持久化"
"${SCRIPT_DIR}/verify-postgres.sh" --env-file "${ENV_FILE}" --persistence

echo "[4/4] 构建并启动 API 和 Web"
"${compose[@]}" up -d --build api web
wait_for_healthy api
wait_for_healthy web
"${compose[@]}" exec -T api node -e "const net=require('node:net');const socket=net.createConnection({host:'postgres',port:5432});socket.setTimeout(5000);socket.on('connect',()=>{socket.end();process.exit(0)});socket.on('timeout',()=>process.exit(1));socket.on('error',()=>process.exit(1))"
"${compose[@]}" exec -T web wget -qO- http://127.0.0.1/api/health
echo
"${compose[@]}" ps

echo "Docker Compose 部署基线已完成。COS 自动备份仍保持未启用。"
