#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SKU_TABLE_ROOT="$(dirname "$(dirname "$(cd -P "${PROJECT_ROOT}" && pwd)")")"
ENV_FILE="${SKU_TABLE_ROOT}/state/.env"
SYSTEMD_DIR="/etc/systemd/system"

if [[ "${EUID}" -ne 0 ]]; then
  echo "请以 root 执行此脚本。" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "环境变量文件不存在：${ENV_FILE}" >&2
  exit 1
fi

required_variables=(COS_BUCKET COS_REGION COS_PREFIX COS_SECRET_ID COS_SECRET_KEY)
for variable_name in "${required_variables[@]}"; do
  variable_value="$(grep -E "^${variable_name}=" "${ENV_FILE}" | tail -1 | cut -d= -f2- || true)"
  if [[ -z "${variable_value}" || "${variable_value}" == replace-with-* ]]; then
    echo "${ENV_FILE} 缺少 ${variable_name}。" >&2
    exit 1
  fi
done

staging_dir="$(grep -E '^BACKUP_STAGING_DIR=' "${ENV_FILE}" | tail -1 | cut -d= -f2- || true)"
staging_dir="${staging_dir:-${SKU_TABLE_ROOT}/state/backup-staging}"
mkdir -p "${staging_dir}"
chmod 700 "${staging_dir}"

install -m 644 "${PROJECT_ROOT}/infra/systemd/sku-table-backup.service" "${SYSTEMD_DIR}/sku-table-backup.service"
install -m 644 "${PROJECT_ROOT}/infra/systemd/sku-table-backup.timer" "${SYSTEMD_DIR}/sku-table-backup.timer"
systemctl daemon-reload
systemctl enable --now sku-table-backup.timer
systemctl status sku-table-backup.timer --no-pager
