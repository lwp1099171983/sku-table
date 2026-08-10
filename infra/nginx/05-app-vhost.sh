#!/bin/sh
# 根据 APP_DOMAIN 生成站点配置：
# - 未配置（域名备案中）：catch-all，IP 直访可用
# - 已配置：仅匹配该域名，其余 Host（含 IP 直访）返回 444
set -e

VHOST_TEMPLATE=/etc/nginx/app-vhost.conf.template
HTTPS_TEMPLATE=/etc/nginx/app-vhost-https.conf.template
VHOST_OUTPUT=/etc/nginx/conf.d/app.conf
REJECT_SOURCE=/etc/nginx/app-reject.conf
HTTPS_REJECT_TEMPLATE=/etc/nginx/app-reject-https.conf.template
REJECT_OUTPUT=/etc/nginx/conf.d/99-reject.conf
CERT_DIR=/etc/letsencrypt/live/${APP_DOMAIN:-}
SSL_CERT=${CERT_DIR}/fullchain.pem
SSL_KEY=${CERT_DIR}/privkey.pem

if [ -n "${APP_DOMAIN:-}" ]; then
  case "${APP_DOMAIN}" in
    *[!A-Za-z0-9.-]*)
      echo "APP_DOMAIN 包含非法字符：${APP_DOMAIN}" >&2
      exit 1
      ;;
  esac

  if [ -s "${SSL_CERT}" ] && [ -s "${SSL_KEY}" ]; then
    sed -e "s|__APP_DOMAIN__|${APP_DOMAIN}|g" \
        -e "s|__SSL_CERT__|${SSL_CERT}|g" \
        -e "s|__SSL_KEY__|${SSL_KEY}|g" \
        "${HTTPS_TEMPLATE}" > "${VHOST_OUTPUT}"
    sed -e "s|__SSL_CERT__|${SSL_CERT}|g" \
        -e "s|__SSL_KEY__|${SSL_KEY}|g" \
        "${HTTPS_REJECT_TEMPLATE}" > "${REJECT_OUTPUT}"
    cat "${REJECT_SOURCE}" >> "${REJECT_OUTPUT}"
  else
    # 证书签发前保持 HTTP 可用，供 Certbot 完成 HTTP-01 验证。
    sed "s|__APP_DOMAIN__|${APP_DOMAIN}|g" "${VHOST_TEMPLATE}" > "${VHOST_OUTPUT}"
    cp "${REJECT_SOURCE}" "${REJECT_OUTPUT}"
  fi
  exit 0
fi

sed "s|__APP_DOMAIN__|_|g" "${VHOST_TEMPLATE}" > "${VHOST_OUTPUT}"
rm -f "${REJECT_OUTPUT}"
