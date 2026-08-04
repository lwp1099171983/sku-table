# 06 — EdgeOne 部署、备份与上线验收

**What to build:** 将前端部署到 EdgeOne Pages，将 Node.js API 部署到腾讯云轻量服务器并由 Caddy 提供 HTTPS，完成数据库备份、恢复演练和团队多人使用验收。

**Blocked by:** 01 — 服务器、PostgreSQL 与安全基线；02 — Node.js API 与受保护登录态；03 — Excel 导入与失败恢复；04 — 商品列表与上传人筛选；05 — 内部备注编辑

**Status:** ready-for-agent

- [ ] React/Vite 应用可以在 EdgeOne Pages 构建、发布并通过 HTTPS 访问
- [ ] API 域名由 Caddy 提供有效 HTTPS 证书，前端通过 HTTPS 调用 API
- [ ] API 配置 CORS 白名单，数据库端口不对公网开放，生产环境不暴露敏感管理密钥
- [ ] 每日备份上传到独立存储，至少保留 7~14 天，并完成一次新环境恢复演练
- [ ] 3 名团队成员同时完成登录、筛选和备注编辑，无明显卡顿或数据串写
- [ ] 核心路径“登录 → 导入 → 筛选 → 改备注”完整跑通，5 万行导入达到性能标准
