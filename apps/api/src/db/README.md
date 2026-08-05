# 数据访问层

这里放 Drizzle schema、迁移、seed 和 repository。数据库连接只在 API 内部使用，禁止前端或共享包引入数据库驱动。

## 当前表

认证与 RBAC：

- `app_users`：登录成员（角色改由 RBAC 表管理，不再内嵌 `role` 字段）；
- `studios`：工作室（团队隔离，名称唯一）；
- `studio_members`：工作室成员关系；
- `roles` / `permissions`：角色与权限目录（由 seed 管理）；
- `role_permissions`：角色-权限映射；
- `studio_member_roles`：用户在工作室内的角色（可多角色）；
- `studio_member_permissions`：用户级直接权限（`allow`/`deny`，`deny` 优先于角色 `allow`）。

业务表：

- `employees`：员工实体（按工作室维护，导入时幂等 upsert）；
- `employee_work_batches` / `employee_work_items`：员工工作文件批次与明细；
- `pricing_batches` / `pricing_items`：选品定价统计批次与明细；
- `import_batches` / `products`：商品导入批次与商品库（含 `internal_note` 内部备注）。

规则：所有业务根表带 `studio_id NOT NULL`；子表用 `(batch_id, studio_id)` 组合外键防止跨工作室关联；批次行数限制 `0~50000`；批次预留 `archived_at`/`archived_by` 归档字段，默认查询排除已归档数据；金额、重量非负，比例字段 `0~1`；统一 `updated_at` 触发器。

## 迁移

执行 `pnpm db:migrate` 会按文件名顺序执行未完成的 SQL 迁移，并使用 PostgreSQL advisory lock 避免多实例同时执行。

- 历史 `0001~0006` 迁移已删除（含会删除定价表的 `0005_reset_pricing_tables.sql`）；
- 新基线迁移：`0001_initial_baseline.sql`，面向空库执行；
- 生产环境执行前必须保留 `pg_dump` 备份，不得直接覆盖已有数据。

## Seed

执行 `pnpm db:seed` 会幂等地初始化：

- 角色与权限目录（`owner` / `selector` / `operator` 与全部权限码）；
- owner 登录账号（`SEED_USER_EMAIL` / `SEED_USER_PASSWORD`）；
- 默认工作室（`SEED_STUDIO_NAME`，默认“默认工作室”）；
- owner 与默认工作室的成员关系及 owner 角色。

重复执行不会创建重复的角色、权限、owner、工作室或成员。
