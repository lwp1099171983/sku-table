## 规范

## 输出
1.  回答要简洁明了
2.  回答用中文，代码备注也用中文
3.  用pnpm管理依赖

## 文档地图

项目文档位于 `docs/` 目录，建议按以下顺序阅读：

1. [`docs/01-需求文档.md`](docs/01-需求文档.md)：项目背景、用户角色、核心功能、数据字典、非功能需求和验收标准。
2. [`docs/02-技术选型文档.md`](docs/02-技术选型文档.md)：技术方案、平台对比、最终架构、部署方式、迁移策略和风险处理。
3. [`docs/03-任务拆分.md`](docs/03-任务拆分.md)：开发阶段、任务清单、依赖关系、里程碑、排期和后续演进任务。

当前确定的技术架构：

```text
腾讯云轻量应用服务器
    └─ Docker Compose
        ├─ Nginx（React/Vite 静态文件、HTTPS、反向代理）
        ├─ Hono.js/Node.js API
        └─ PostgreSQL（仅内部网络访问）
```

文档维护约定：需求变更先更新需求文档；技术方案变更同步更新技术选型文档；任务状态和排期更新任务拆分文档；新增、移动或删除目录/文件时，必须同步更新本结构地图和 `docs/04-项目结构.md`。

## 项目结构地图

```text
.
├── apps/
│   ├── web/                        # React/Vite 前端
│   │   ├── src/
│   │   │   ├── App.tsx             # 路由入口（页面与布局的挂载点）
│   │   │   ├── main.tsx            # React 挂载入口
│   │   │   ├── pages/              # 页面组件（含同目录 CSS）
│   │   │   ├── layouts/            # 应用布局、认证/主题上下文
│   │   │   ├── components/         # 可复用组件
│   │   │   ├── services/           # API 客户端和业务请求封装
│   │   │   ├── hooks/              # 自定义 hooks
│   │   │   ├── constants/          # 前端常量
│   │   │   └── styles/             # 全局样式和 Ant Design 主题
│   │   ├── public/templates/       # Excel 导入模板
│   │   ├── index.html
│   │   └── vite.config.ts
│   └── api/                        # Hono.js/Node.js 后端
│       ├── src/
│       │   ├── app.ts              # Hono 应用组装（入口，挂载全部路由）
│       │   ├── server.ts           # Node 服务启动入口
│       │   ├── routes/             # HTTP 路由层（auth/employeeWork/pricing/products/studios/imports/users/health）
│       │   ├── modules/            # 业务层，按领域拆分（repository/service/parser）
│       │   │   ├── auth/           # 认证、令牌、RBAC
│       │   │   ├── employee-work/  # 员工工作记录
│       │   │   ├── pricing/        # 定价
│       │   │   ├── products/       # 产品
│       │   │   └── studios/        # 工作室
│       │   ├── middleware/         # 错误处理、认证等通用中间件
│       │   ├── config/             # 环境变量和运行时配置
│       │   └── db/                 # client、schema、migrate、seed、migrations
│       ├── package.json
│       └── Dockerfile
├── packages/
│   └── shared/                     # 前后端共享 DTO、领域类型、常量
│       └── src/                    # index.ts / dto.ts / type.ts
├── infra/                          # 部署和运维
│   ├── docker/                     # Docker Compose 和环境变量示例
│   ├── nginx/                      # 静态文件与 /api 反向代理
│   ├── scripts/                    # 部署、备份、健康检查脚本
│   └── legacy/supabase/            # 历史兼容迁移材料（不参与主流程）
├── docs/                           # 需求、技术、任务和结构文档
├── .agents/skills/                 # 项目辅助技能
├── .scratch/                       # 需求拆分和临时材料
├── AGENTS.md                       # 本规范与结构地图
├── README.md                       # 项目介绍和本地开发说明
├── package.json                    # 根工作区脚本（pnpm）
├── pnpm-workspace.yaml             # pnpm workspace 配置
└── pnpm-lock.yaml                  # 依赖锁定文件
```

## 快速导航

| 任务 | 位置 |
|---|---|
| 新增/修改前端页面 | `apps/web/src/pages` + 对应 `services/` |
| 新增/修改 API | `apps/api/src/routes` + 对应 `modules/` |
| 认证与权限 | `apps/api/src/modules/auth`、`routes/auth.ts`、`layouts/AuthContext.tsx` |
| 数据库变更 | `apps/api/src/db`（schema + migrations + seed） |
| 前后端共享类型 | `packages/shared/src` |
| 部署与运维 | `infra/` |

结构地图不列出 `node_modules`、`dist`、`.pnpm-store`、本地 `.env` 和其他构建产物；这些文件不应作为源码修改入口。
