#!/usr/bin/env bash

set -eEuo pipefail

required_variables=(
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  COS_BUCKET
  COS_REGION
  COS_SECRET_ID
  COS_SECRET_KEY
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "缺少备份配置：${variable_name}" >&2
    exit 2
  fi
done

backup_prefix="${COS_PREFIX:-postgres}"
backup_prefix="${backup_prefix#/}"
backup_prefix="${backup_prefix%/}"
if [[ -z "${backup_prefix}" ]]; then
  echo "COS_PREFIX 不能为空。" >&2
  exit 2
fi

staging_root="${BACKUP_STAGING_DIR:-/var/lib/sku-table-backup}"
mkdir -p "${staging_root}"
chmod 700 "${staging_root}"

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_directory="$(mktemp -d "${staging_root}/backup-${timestamp}-XXXXXX")"
backup_file="${backup_directory}/${POSTGRES_DB}-${timestamp}.dump"
object_key="${backup_prefix}/${POSTGRES_DB}-${timestamp}.dump"
backup_succeeded=false

cleanup() {
  local exit_status="$?"

  if [[ "${backup_succeeded}" == "true" ]]; then
    rm -rf "${backup_directory}"
  else
    echo "[backup] 失败，本地备份保留在：${backup_file}" >&2
  fi

  exit "${exit_status}"
}
trap cleanup EXIT

echo "[backup] 开始：${started_at}，对象：cos://${COS_BUCKET}/${object_key}"
export PGPASSWORD="${POSTGRES_PASSWORD}"
pg_dump \
  --host=postgres \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="${backup_file}"
unset PGPASSWORD

backup_size_bytes="$(wc -c < "${backup_file}" | tr -d '[:space:]')"
if [[ ! "${backup_size_bytes}" =~ ^[1-9][0-9]*$ ]]; then
  echo "生成的备份文件为空。" >&2
  exit 1
fi

/usr/local/bin/upload-to-cos.py \
  --file "${backup_file}" \
  --bucket "${COS_BUCKET}" \
  --region "${COS_REGION}" \
  --key "${object_key}" \
  --expected-size "${backup_size_bytes}"

backup_succeeded=true
finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[backup] 成功：${finished_at}，大小：${backup_size_bytes} bytes，对象：cos://${COS_BUCKET}/${object_key}"
