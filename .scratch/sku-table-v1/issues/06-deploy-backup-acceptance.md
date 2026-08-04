# 06 — EdgeOne 与腾讯云服务器部署验收

**What to build:** 将前端部署到 EdgeOne Pages，将 Hono.js/Node.js API 部署到腾讯云轻量应用服务器，由 Nginx 提供反向代理和 HTTPS，使用 PM2 或 systemd 管理进程，完成日志、数据库备份、恢复演练和团队多人使用验收。

**Blocked by:** 01 — Hono.js/Node.js 后端与数据库基础；02 — 认证、权限与 Hono API；03 — Excel 导入与失败恢复；04 — 商品列表与上传人筛选；05 — 内部备注编辑

**Status:** ready-for-agent

- [ ] React/Vite 应用可以在 EdgeOne Pages 构建、发布并通过 HTTPS 访问
- [ ] 腾讯云轻量服务器完成 Ubuntu、Node.js、PostgreSQL、Nginx 和 PM2 或 systemd 配置，API 可以开机自启和异常重启
- [ ] Nginx 配置域名反向代理和 HTTPS 证书，前端通过 HTTPS 调用 Hono.js API，证书续期和到期检查可验证
- [ ] API 配置 CORS 白名单，防火墙只开放 80、443 和受限制的 SSH 端口，数据库端口不对公网开放
- [ ] 生产环境通过环境变量注入数据库连接、JWT 密钥、Cookie 签名密钥和第三方凭据，不暴露敏感管理密钥
- [ ] Nginx 访问日志、错误日志和 Node.js 应用日志按天切分并保留，健康检查可以发现 API 或数据库异常
- [ ] 每日执行 `pg_dump` 并上传到独立存储，至少保留 7~14 天，完成一次新环境恢复演练
- [ ] 3 名团队成员同时完成登录、筛选和备注编辑，无明显卡顿或数据串写
- [ ] 核心路径“登录 → 导入 → 筛选 → 改备注”完整跑通，5 万行导入达到性能标准
