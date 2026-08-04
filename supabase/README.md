# 数据库基线（备用方案）

当前 v1 主方案已切换为腾讯云轻量应用服务器 + Node.js API + PostgreSQL。本目录仅保留 MemFire/Supabase 兼容迁移材料，主流程不再依赖它。

## 执行迁移

在 MemFire Cloud 的 SQL Editor 中执行 `migrations/202608040001_initial_security_baseline.sql`。MemFire 当前按入门套餐收费，约 30 元/月起；购买前请确认数据库容量、API 调用额度、连接数和批量导入限制。执行完成后，再执行 `tests/202608040001_security_baseline.sql` 做结构、RLS 和字段权限检查。

## 开通团队成员

v1 不开放公开注册。负责人先在 MemFire Auth 中创建邮箱账号，再把 Auth 用户 UUID 和邮箱写入 `app_users`：

```sql
insert into public.app_users (auth_user_id, email, display_name, role)
values ('Auth 用户 UUID', '成员邮箱', '成员姓名', 'selector');
```

可用角色为 `owner`、`selector`、`operator`。停用成员时，将 `is_active` 更新为 `false`；v1 的成员管理通过 SQL Editor 完成，前端管理员页面属于 v1.1。

## 手工安全验证

使用两个已开通成员的登录会话分别验证：

1. A 成员写入伪造的 `created_by` 时，数据库拒绝请求；
2. A 成员向 B 成员的 `batch_id` 写入商品时，数据库拒绝请求；
3. 任意成员可以更新 `internal_note`；
4. 更新 `created_by`、`created_at`、`batch_id` 或任意原始导入字段时，数据库拒绝请求；
5. 未开通成员即使能完成 Auth 登录，也无法读取 `app_users`、`import_batches` 和 `products` 的业务数据。

选品员和负责人可以创建导入批次；客服/运营账号只能查看商品和编辑内部备注，不能导入数据。

## 设计说明

- `app_users.id` 是业务用户 ID，`auth_user_id` 只保存认证用户 UUID，不直接建立平台内部用户表外键。
- `created_by`、`created_at` 和 `updated_at` 由数据库触发器维护，前端提交的值不会生效。
- v1 仅授予 `products.internal_note` 更新权限，不授予商品删除权限或其他商品字段更新权限。
- v1 不包含操作审计、修改历史和删除日志。
