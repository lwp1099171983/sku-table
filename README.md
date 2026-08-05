# sku-table

团队选品工具，采用前后端分离的 npm workspaces 结构。

## 常用命令

```bash
pnpm install
pnpm db:local:up     # 启动本地 PostgreSQL（Docker）
pnpm db:migrate      # 创建数据库表和执行未完成迁移
pnpm db:seed         # 创建本地负责人账号
pnpm dev:web         # 启动 React/Vite
pnpm dev:api         # 启动 Hono API
pnpm build           # 构建前后端
pnpm typecheck       # 检查前后端类型
```

## 本地 PostgreSQL

首次使用时复制环境变量文件：

```bash
cp infra/docker/.env.local.example infra/docker/.env.local
```

有 Docker 时执行 `pnpm db:local:up`，数据库只映射到本机 `127.0.0.1:5432`，数据保存在 `postgres-local-data` 卷中。停止数据库执行 `pnpm db:local:down`，连接串为 `postgresql://sku_table:sku_table_local_password@localhost:5432/sku_table`。

本机直接安装 PostgreSQL 时，也可以使用相同的数据库名、用户、密码和连接串，API 配置放在 `apps/api/.env`。

登录开发流程：先启动数据库，执行 `pnpm db:migrate` 和 `pnpm db:seed`，再执行 `pnpm dev:api`、`pnpm dev:web`。本地 seed 账号配置在 `apps/api/.env`，仅用于开发，不提交到 Git。

## 目录

```text
apps/
  web/                 React/Vite 前端
  api/                 Hono.js/Node.js 后端
packages/
  shared/              前后端共享 DTO 和领域类型
infra/
  docker/              Docker Compose 编排
  nginx/               Nginx 配置
  scripts/             部署、备份和运维脚本
  legacy/supabase/     历史兼容迁移材料，不参与主流程
docs/                  需求、技术方案和任务文档
```

前端通过 `apps/web/src/services` 调用 API；数据库、认证和业务规则属于 `apps/api`，页面组件不直接依赖数据库驱动。
