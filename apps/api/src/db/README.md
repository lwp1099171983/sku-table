# 数据访问层

这里放 Drizzle schema、迁移、seed 和 repository。数据库连接只在 API 内部使用，禁止前端或共享包引入数据库驱动。

## 当前表

认证与 RBAC：

- `app_users`：登录账号（`is_admin` 为全局管理员：看全部店铺、拥有全部权限；角色改由 RBAC 表管理）；
- `shops`：店铺（团队隔离，名称唯一）；
- `shop_members`：店铺成员关系；
- `roles` / `permissions`：角色与权限目录（由 seed 管理）；
- `role_permissions`：角色-权限映射；
- `shop_member_roles`：用户在店铺内的角色（可多角色）；
- `shop_member_permissions`：用户级直接权限（`allow`/`deny`，`deny` 优先于角色 `allow`，删除类权限靠这里开通）。

业务表：

- `employees`：员工实体（按店铺维护，导入时幂等 upsert）；
- `employee_work_batches` / `employee_work_items`：员工工作文件批次与明细；
- `ledger_batches` / `ledger_items`：台账批次与明细（25 个业务字段全部 `text` 保存原始值，公式列不重算）。

规则：所有业务根表带 `shop_id NOT NULL`；子表用 `(batch_id, shop_id)` 组合外键防止跨店铺关联；批次行数限制 `0~50000`；批次预留 `archived_at`/`archived_by` 归档字段，默认查询排除已归档数据；员工工作金额非负；台账金额可正可负（毛利/净利允许为负）；统一 `updated_at` 触发器。

## 迁移

执行 `pnpm db:migrate` 会按文件名顺序执行未完成的 SQL 迁移，并使用 PostgreSQL advisory lock 避免多实例同时执行。

- `0001_initial_baseline.sql`：空库基线（店铺体系 + 员工工作 + 台账）；
- `0002_drop_pricing_tables.sql`：清理已下线的定价表；
- `0003_shop_ledger_refactor.sql`：工作室→店铺重构（改名、删商品表、旧 owner 升级为管理员、加台账表），空库执行为条件空操作；
- `0004_ledger_text_and_tracking.sql`：台账改 text 保存原始值并补充跟踪号；
- 生产环境执行前必须保留 `pg_dump` 备份，不得直接覆盖已有数据。

## Seed

执行 `pnpm db:seed` 会幂等地初始化：

- 角色与权限目录（`admin` / `leader` / `customer` 与 10 个权限码）；
- 管理员登录账号（`SEED_USER_EMAIL` / `SEED_USER_PASSWORD`，`is_admin = true`）；
- 默认店铺（`SEED_SHOP_NAME`，默认"默认店铺"）。

重复执行不会创建重复的角色、权限、管理员或店铺。
