# 02 — 认证、权限与 Hono API

**What to build:** 使用 Hono.js 在 Node.js 上提供健康检查、认证、权限和业务 API，完成邮箱密码登录、JWT 登录态、团队成员准入、角色权限、统一错误处理和环境变量校验。

**Blocked by:** 01 — Hono.js/Node.js 后端与数据库基础

**Status:** ready-for-agent

- [ ] API 提供健康检查、登录、当前用户和退出接口，已开通成员可以登录并获得有效登录令牌
- [ ] 密码使用安全哈希保存，接口不返回密码哈希，登录失败不泄露账号是否存在
- [ ] 只有 `app_users.is_active = true` 的成员可以访问业务 API，未开通账号得到明确的无权限响应
- [ ] API 从 JWT 确定当前用户，客户端伪造 `created_by`、角色或用户 ID 不会改变服务端身份
- [ ] `owner` 和 `selector` 可以导入，`operator` 只能查看商品和编辑内部备注
- [ ] API 与数据库访问通过 service/repository 层和 Drizzle ORM 封装，前端不直接依赖数据库驱动
- [ ] 请求参数和响应结构经过 Zod 或等效 schema 校验，统一返回错误码、错误消息和 HTTP 状态码
- [ ] 缺少或错误的环境变量、无效令牌、权限不足和数据库异常都有安全的错误响应
- [ ] 后端测试覆盖登录、令牌失效、成员准入、角色权限和伪造身份字段
