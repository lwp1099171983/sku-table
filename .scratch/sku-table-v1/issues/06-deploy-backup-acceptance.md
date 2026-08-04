# 06 — 腾讯云轻量服务器部署与上线验收

**What to build:** 将 React/Vite 构建产物、Hono.js/Node.js API 和 PostgreSQL 部署到同一台腾讯云轻量应用服务器，使用 Docker Compose 管理服务，由 Nginx 提供前端静态文件、反向代理和 HTTPS，完成日志、数据库备份、恢复演练和团队多人使用验收。

**Blocked by:** 01 — Hono.js/Node.js 后端与数据库基础；02 — 认证、权限与 Hono API；03 — Excel 导入与失败恢复；04 — 商品列表与上传人筛选；05 — 内部备注编辑

**Status:** ready-for-agent

- [ ] 腾讯云轻量服务器完成 Ubuntu、Docker、Docker Compose 和域名配置，Nginx、Hono.js/Node.js API、PostgreSQL 可以开机自启和异常重启
- [ ] React/Vite 构建产物由服务器上的 Nginx 提供，通过正式 HTTPS 域名访问，`/api` 请求可以转发到 Hono.js API
- [ ] Nginx 配置 HTTPS 证书、自动续期和到期检查，前端与 API 的访问链路可验证
- [ ] Hono.js API 和 PostgreSQL 仅通过 Compose 内部网络通信，防火墙只开放 80、443 和受限制的 SSH 端口，数据库端口不对公网开放
- [ ] 生产环境通过环境变量注入数据库连接、JWT 密钥、Cookie 签名密钥和第三方凭据，不暴露敏感管理密钥
- [ ] Nginx 访问日志、错误日志、Hono.js 应用日志和 PostgreSQL 日志按天切分并保留，健康检查可以发现 API 或数据库异常
- [ ] 每日执行 `pg_dump` 并上传到服务器外部存储，至少保留 7~14 天，完成一次新服务器恢复演练
- [ ] 记录 CPU、内存、磁盘和 5 万行导入期间的资源峰值，确认资源限制不会导致服务异常
- [ ] 3 名团队成员同时完成登录、筛选和备注编辑，无明显卡顿或数据串写
- [ ] 核心路径“登录 → 导入 → 筛选 → 改备注”完整跑通，5 万行导入达到性能标准
