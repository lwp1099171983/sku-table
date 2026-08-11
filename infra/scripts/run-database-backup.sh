#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SKU_TABLE_ROOT="$(dirname "$(dirname "$(cd -P "${PROJECT_ROOT}" && pwd)")")"
COMPOSE_FILE="${PROJECT_ROOT}/infra/docker/docker-compose.yml"
ENV_FILE="${SKU_TABLE_ROOT}/state/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "环境变量文件不存在：${ENV_FILE}" >&2
  exit 1
fi

read_env() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "${ENV_FILE}" | tail -1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "${value}"
}

staging_dir="$(read_env BACKUP_STAGING_DIR)"
staging_dir="${staging_dir:-${SKU_TABLE_ROOT}/state/backup-staging}"
mkdir -p "${staging_dir}"
chmod 700 "${staging_dir}"

required_variables=(COS_BUCKET COS_REGION COS_PREFIX COS_SECRET_ID COS_SECRET_KEY)
for variable_name in "${required_variables[@]}"; do
  variable_value="$(read_env "${variable_name}")"
  if [[ -z "${variable_value}" || "${variable_value}" == replace-with-* ]]; then
    echo "${ENV_FILE} 缺少 ${variable_name}。" >&2
    exit 1
  fi
done

compose=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" --profile ops)
postgres_container_id="$("${compose[@]}" ps -q postgres)"
if [[ -z "${postgres_container_id}" ]]; then
  echo "PostgreSQL 容器未运行。" >&2
  exit 1
fi

postgres_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${postgres_container_id}")"
if [[ "${postgres_health}" != "healthy" ]]; then
  echo "PostgreSQL 容器未处于 healthy 状态：${postgres_health}" >&2
  exit 1
fi

lock_file="${SKU_TABLE_ROOT}/state/backup.lock"
exec 9>"${lock_file}"
if ! flock -n 9; then
  echo "已有数据库备份任务正在执行。" >&2
  exit 1
fi

"${compose[@]}" run --rm --no-deps backup
