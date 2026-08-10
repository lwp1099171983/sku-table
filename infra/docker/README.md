# Docker Compose 生产部署

## 前置条件

- Ubuntu 服务器已安装 Docker Engine 和 Docker Compose 插件；
- 服务器防火墙只开放 80、443 和受限 SSH，不开放 3000 和 5432；
- 项目代码已上传到服务器；
- COS 可以保留现有配置，但本阶段不启用备份定时任务。

## 首次部署

1. 创建生产环境变量文件：

   ```bash
   cp infra/docker/.env.example infra/docker/.env
   chmod 600 infra/docker/.env
   ```

2. 替换 `.env` 中的 PostgreSQL 密码、`DATABASE_URL` 和 `JWT_SECRET`。密码不得进入 Git、镜像或日志。
3. 域名备案通过后，在 `.env` 中填写 `APP_DOMAIN`（如 `sku.example.com`）；备案完成前保持为空，通过服务器 IP 访问。

4. 执行部署脚本：

   ```bash
   ./infra/scripts/deploy.sh --persistence
   ```

脚本会先启动 PostgreSQL，验证容器健康、数据库可连接、5432 未发布到宿主机；加 `--persistence` 时会通过容器重启验证数据卷持久化（首次部署、数据库或卷变更时建议启用）。验收通过后才会启动 API 和 Web。

5. DNS 的 A 记录指向服务器后，签发正式证书：

   ```bash
   mkdir -p /opt/sku-table/state/acme
   certbot certonly --webroot \
     --webroot-path /opt/sku-table/state/acme \
     --domain sku.iboluo.top \
     --non-interactive --agree-tos --register-unsafely-without-email
   docker compose --env-file /opt/sku-table/state/.env \
     -f /opt/sku-table/current/infra/docker/docker-compose.yml up -d --force-recreate web
   ```

   Certbot 自动续期后执行 `docker exec sku-table-web-1 nginx -s reload`，让 Nginx 载入新证书。

日常代码发布（`remote-deploy.sh`）默认不重启 PostgreSQL，发布期间数据库保持可用；涉及数据库结构或数据卷变更时，在发布命令后加 `--persistence` 再执行持久化验收。

## 复查 PostgreSQL

不重启容器的日常检查：

```bash
./infra/scripts/verify-postgres.sh
```

包含容器重启的持久化验收：

```bash
./infra/scripts/verify-postgres.sh --persistence
```

## 当前边界

- Nginx 提供 HTTP/HTTPS、证书挂载和 HTTP→HTTPS 跳转；证书由 Let’s Encrypt 管理；
- API 当前只有 `/api/health`，任务 01~05 的数据库迁移、认证和业务链路尚未实现；
- COS 自动备份属于任务 07，PostgreSQL 真实服务器验收通过前不得启用。

## 访问域名（APP_DOMAIN）

- `APP_DOMAIN` 为空时，Nginx 为 HTTP catch-all 站点，服务器 IP 直接访问即可（域名备案过渡期）。
- 填写 `APP_DOMAIN` 并重新部署后，Nginx 只响应该域名，HTTP 自动跳转 HTTPS，未匹配的 Host（含 IP 直访）返回 444 断开。
- 证书签发前保持 HTTP 可用，待 DNS 指向服务器后执行 `certbot certonly --webroot` 签发正式证书；签发后重建 Web 容器启用 HTTPS，证书续期后需 reload Web 容器。
- 一台服务器部署多个项目时，每个项目绑定各自的域名与端口；如需统一入口，可后续在宿主机增加 Nginx 按域名反向代理。
