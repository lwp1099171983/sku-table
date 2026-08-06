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
   ./infra/scripts/deploy.sh
   ```

脚本会先启动 PostgreSQL，验证容器健康、数据库可连接、5432 未发布到宿主机，并通过容器重启验证数据卷持久化。验收通过后才会启动 API 和 Web。

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

- Nginx 当前提供 HTTP 部署基线；正式 HTTPS 需在确定域名和证书后配置；
- API 当前只有 `/api/health`，任务 01~05 的数据库迁移、认证和业务链路尚未实现；
- COS 自动备份属于任务 07，PostgreSQL 真实服务器验收通过前不得启用。

## 访问域名（APP_DOMAIN）

- `APP_DOMAIN` 为空时，Nginx 为 catch-all 站点，服务器 IP 直接访问即可（域名备案过渡期）。
- 填写 `APP_DOMAIN` 并重新部署后，Nginx 只响应该域名，未匹配的 Host（含 IP 直访）返回 444 断开。
- 一台服务器部署多个项目时，每个项目绑定各自的域名与端口；如需统一入口，可后续在宿主机增加 Nginx 按域名反向代理。
