# API

Hono.js/Node.js 后端入口为 `src/server.ts`，应用组装在 `src/app.ts`。

后续按以下边界扩展：

- `routes`：HTTP 路由和请求响应适配；
- `middleware`：认证、权限、错误处理和请求上下文；
- `modules`：按用户、商品、导入批次拆分业务服务；
- `db`：Drizzle schema、迁移和 repository；
- `config`：环境变量和运行时配置。
