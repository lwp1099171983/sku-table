#!/bin/sh
# 根据 APP_DOMAIN 生成站点配置：
# - 未配置（域名备案中）：catch-all，IP 直访可用
# - 已配置：仅匹配该域名，其余 Host（含 IP 直访）返回 444
set -e

VHOST_TEMPLATE=/etc/nginx/app-vhost.conf.template
VHOST_OUTPUT=/etc/nginx/conf.d/app.conf
REJECT_SOURCE=/etc/nginx/app-reject.conf
REJECT_OUTPUT=/etc/nginx/conf.d/99-reject.conf

if [ -n "${APP_DOMAIN:-}" ]; then
  sed "s|__APP_DOMAIN__|${APP_DOMAIN}|g" "${VHOST_TEMPLATE}" > "${VHOST_OUTPUT}"
  cp "${REJECT_SOURCE}" "${REJECT_OUTPUT}"
else
  sed "s|__APP_DOMAIN__|_|g" "${VHOST_TEMPLATE}" > "${VHOST_OUTPUT}"
  rm -f "${REJECT_OUTPUT}"
fi
