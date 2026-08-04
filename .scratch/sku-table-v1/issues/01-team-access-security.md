# 01 — Hono.js/Node.js 后端与数据库基础

**What to build:** 初始化 Hono.js + Node.js + TypeScript 后端项目，配置 PostgreSQL 连接和 Drizzle ORM，完成业务 schema、索引、约束和版本化迁移，为后续 Hono API 提供稳定的数据基础。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Hono.js 后端可以在 Node.js 上启动，TypeScript 编译和依赖 lockfile 检查通过
- [ ] PostgreSQL 连接通过环境变量配置，使用连接池和参数化查询，连接失败时给出明确错误
- [ ] `drizzle-orm` schema 与 PostgreSQL 表结构一致，`drizzle-kit` 可以生成并执行版本化迁移
- [ ] 完成 `app_users`、`products`、`import_batches` 三张表、约束、索引和迁移脚本
- [ ] `created_by`、`created_at`、`updated_at`、`batch_id` 等系统字段由 API 和数据库约束保护
- [ ] 数据库密码、JWT 密钥和备份凭据通过环境变量或受限文件提供，不进入仓库和前端构建产物
- [ ] 完成数据库连接、迁移和基础 schema 的自动化测试
- [ ] v1 不开放删除、商品字段编辑和批次回滚
