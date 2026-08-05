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

文档维护约定：需求变更先更新需求文档；技术方案变更同步更新技术选型文档；任务状态和排期更新任务拆分文档。

## 项目结构地图

```text
.
├── apps/
│   ├── web/                              # React/Vite 前端应用
│   │   ├── src/
│   │   │   ├── components/               # 可复用页面组件
│   │   │   ├── layouts/                  # 应用布局、认证上下文
│   │   │   ├── pages/                    # 登录、员工工作记录等页面
│   │   │   ├── services/                 # API 客户端和业务请求封装
│   │   │   ├── App.tsx                   # 路由入口
│   │   │   ├── main.tsx                  # React 挂载入口
│   │   │   ├── styles/                   # 全局样式和 Ant Design 主题变量
│   │   │   │   └── global.css
│   │   │   └── ...                       # 页面组件及其同目录 CSS
│   │   ├── Dockerfile
│   │   ├── index.html
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── api/                              # Hono.js/Node.js 后端应用
│       ├── src/
│       │   ├── config/                   # 环境变量和运行时配置
│       │   ├── db/                       # 数据库客户端、schema、迁移、seed
│       │   │   └── migrations/           # SQL 数据库迁移
│       │   ├── middleware/               # 错误处理、认证等通用中间件
│       │   ├── modules/                  # 按领域拆分的业务模块
│       │   │   ├── auth/                 # 用户认证、令牌和权限
│       │   │   └── employee-work/        # 员工工作记录解析和数据访问
│       │   ├── routes/                   # HTTP 路由
│       │   ├── app.ts                    # Hono 应用组装
│       │   └── server.ts                 # Node.js 服务入口
│       ├── Dockerfile
│       └── package.json
├── packages/
│   └── shared/                           # 前后端共享 DTO、领域类型和常量
│       ├── src/
│       │   ├── dto.ts
│       │   ├── type.ts
│       │   └── index.ts
│       └── package.json
├── infra/                                # 部署和运维配置
│   ├── docker/                           # Docker Compose 和环境变量示例
│   ├── nginx/                            # 静态文件和 /api 反向代理
│   ├── scripts/                          # 部署、健康检查等脚本
│   └── legacy/supabase/                  # 历史兼容迁移材料，不参与主流程
├── docs/                                 # 需求、技术、任务和结构文档
│   ├── 01-需求文档.md
│   ├── 02-技术选型文档.md
│   ├── 03-任务拆分.md
│   └── 04-项目结构.md
├── .agents/skills/                       # 项目辅助技能及其配置
├── .scratch/                             # 需求拆分和临时工作材料
├── AGENTS.md                             # Agent 工作规范和本结构地图
├── README.md                             # 项目介绍和本地开发说明
├── package.json                          # 根工作区脚本
├── pnpm-workspace.yaml                   # pnpm workspace 配置
└── pnpm-lock.yaml                        # 依赖锁定文件
```

结构地图不列出 `node_modules`、`dist`、本地 `.env` 和其他构建产物；这些文件不应作为源码修改入口。
