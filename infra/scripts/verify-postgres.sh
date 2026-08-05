#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/infra/docker/docker-compose.yml"
ENV_FILE="${PROJECT_ROOT}/infra/docker/.env"
VERIFY_PERSISTENCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --persistence)
      VERIFY_PERSISTENCE=true
      shift
      ;;
    *)
      echo "不支持的参数：$1" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "环境变量文件不存在：${ENV_FILE}" >&2
  exit 1
fi

compose=(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

wait_for_postgres() {
  local container_id
  local health

  for _ in {1..30}; do
    container_id="$("${compose[@]}" ps -q postgres)"
    if [[ -n "${container_id}" ]]; then
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}")"
      if [[ "${health}" == "healthy" ]]; then
        return 0
      fi
    fi
    sleep 4
  done

  echo "PostgreSQL 容器未在 120 秒内进入 healthy 状态。" >&2
  "${compose[@]}" logs --tail=100 postgres >&2
  return 1
}

wait_for_postgres

"${compose[@]}" exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
"${compose[@]}" exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database(), current_user, version();"'
"${compose[@]}" run --rm --no-deps postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;"'

published_port="$("${compose[@]}" port postgres 5432 2>/dev/null || true)"
if [[ -n "${published_port}" ]]; then
  echo "PostgreSQL 5432 端口不应发布到宿主机：${published_port}" >&2
  exit 1
fi

if [[ "${VERIFY_PERSISTENCE}" == "true" ]]; then
  check_database="sku_table_persistence_check_$(date -u +%Y%m%d%H%M%S)_$$"
  check_created=false

  cleanup() {
    if [[ "${check_created}" == "true" ]]; then
      "${compose[@]}" exec -T postgres sh -c 'dropdb --if-exists -U "$POSTGRES_USER" "$1"' _ "${check_database}" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup EXIT

  "${compose[@]}" exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" "$1"' _ "${check_database}"
  check_created=true
  "${compose[@]}" exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -c "CREATE TABLE persistence_check (value text NOT NULL); INSERT INTO persistence_check VALUES ('"'"'ok'"'"');"' _ "${check_database}"

  "${compose[@]}" restart postgres
  wait_for_postgres

  persisted_value="$("${compose[@]}" exec -T postgres sh -c 'psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -c "SELECT value FROM persistence_check LIMIT 1;"' _ "${check_database}")"
  if [[ "${persisted_value}" != "ok" ]]; then
    echo "PostgreSQL 容器重启后未读取到持久化验证数据。" >&2
    exit 1
  fi

  "${compose[@]}" exec -T postgres sh -c 'dropdb --if-exists -U "$POSTGRES_USER" "$1"' _ "${check_database}"
  check_created=false
  trap - EXIT
  echo "PostgreSQL 持久化验证通过。"
fi

echo "PostgreSQL 健康、连接和端口隔离验证通过。"
