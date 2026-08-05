# sku-table

团队选品工具，采用前后端分离的 npm workspaces 结构。

## 常用命令

```bash
npm install
npm run dev:web       # 启动 React/Vite
npm run dev:api       # 启动 Hono API
npm run build         # 构建前后端
npm run typecheck     # 检查前后端类型
```

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
