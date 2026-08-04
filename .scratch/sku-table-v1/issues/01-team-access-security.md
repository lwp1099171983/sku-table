# 01 — 服务器、PostgreSQL 与安全基线

**What to build:** 建立腾讯云轻量应用服务器、Docker Compose、PostgreSQL 和基础安全基线，让数据库不暴露公网，并为后续 Node.js API 提供稳定的业务表和备份能力。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 服务器使用 Ubuntu 24.04 LTS，起步配置和月均预算符合项目约束
- [ ] Docker Compose 可以启动 PostgreSQL、Caddy 和 API 所需网络，数据库仅监听内部网络
- [ ] 防火墙只开放 80、443 和受限制的 SSH 端口，公网无法连接 PostgreSQL
- [ ] 完成 `app_users`、`products`、`import_batches` 三张表、约束、索引和迁移脚本
- [ ] `created_by`、`created_at`、`updated_at`、`batch_id` 等系统字段由服务端和数据库约束保护
- [ ] 每日备份脚本可生成 PostgreSQL 备份，并验证备份文件可读取
- [ ] v1 不开放删除、商品字段编辑和批次回滚
