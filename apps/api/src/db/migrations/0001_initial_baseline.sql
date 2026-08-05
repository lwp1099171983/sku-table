-- 数据库与 RBAC 重建基线迁移（替代历史 0001~0006）
-- 前提：旧数据已通过 pg_dump 备份或本地直接重建，本迁移面向空库执行。

-- 扩展
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- 登录用户（角色改由 RBAC 表管理，不再内嵌角色字段）
create table app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_lowercase check (email = lower(email)),
  constraint app_users_email_not_blank check (btrim(email) <> ''),
  constraint app_users_email_length check (char_length(email) <= 320)
);

create unique index if not exists app_users_email_unique on app_users (email);
create index if not exists app_users_active_email_idx on app_users (is_active, email);

-- 工作室（团队隔离）
create table studios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studios_name_not_blank check (btrim(name) <> ''),
  constraint studios_name_length check (char_length(name) between 1 and 100)
);

create unique index if not exists studios_name_unique on studios (lower(name));

-- 工作室成员
create table studio_members (
  studio_id uuid not null references studios(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (studio_id, user_id)
);

-- 角色目录（由 seed 管理，v1 不开放创建）
create table roles (
  code text primary key,
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  constraint roles_code_not_blank check (btrim(code) <> ''),
  constraint roles_name_not_blank check (btrim(name) <> '')
);

-- 权限目录
create table permissions (
  code text primary key,
  name text not null,
  description text,
  constraint permissions_code_not_blank check (btrim(code) <> ''),
  constraint permissions_name_not_blank check (btrim(name) <> '')
);

-- 角色-权限映射
create table role_permissions (
  role_code text not null references roles(code) on delete cascade,
  permission_code text not null references permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

-- 用户在工作室内的角色（可多角色）
create table studio_member_roles (
  studio_id uuid not null,
  user_id uuid not null,
  role_code text not null references roles(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (studio_id, user_id, role_code),
  foreign key (studio_id, user_id) references studio_members(studio_id, user_id) on delete cascade
);

-- 用户级直接权限（allow/deny，deny 优先于角色 allow）
create table studio_member_permissions (
  studio_id uuid not null,
  user_id uuid not null,
  permission_code text not null references permissions(code) on delete cascade,
  effect text not null default 'allow' check (effect in ('allow', 'deny')),
  granted_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (studio_id, user_id, permission_code),
  foreign key (studio_id, user_id) references studio_members(studio_id, user_id) on delete cascade
);

-- 员工实体（按工作室维护，员工名保持导入快照）
create table employees (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_name_not_blank check (btrim(name) <> ''),
  constraint employees_name_length check (char_length(name) between 1 and 100),
  unique (id, studio_id)
);

create unique index if not exists employees_studio_name_unique
  on employees (studio_id, lower(name));

-- 员工工作批次
create table employee_work_batches (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  employee_id uuid,
  employee_name text not null,
  work_date date not null,
  file_name text not null,
  uploaded_by uuid not null references app_users(id) on delete restrict,
  total_rows integer not null default 0,
  archived_at timestamptz,
  archived_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_work_batches_employee_name_not_blank check (btrim(employee_name) <> ''),
  constraint employee_work_batches_employee_name_length check (char_length(employee_name) between 1 and 100),
  constraint employee_work_batches_file_name_not_blank check (btrim(file_name) <> ''),
  constraint employee_work_batches_file_name_length check (char_length(file_name) between 1 and 255),
  constraint employee_work_batches_total_rows_range check (total_rows between 0 and 50000),
  unique (id, studio_id),
  foreign key (employee_id, studio_id) references employees(id, studio_id) on delete set null
);

-- 员工工作明细（组合外键防止跨工作室关联）
create table employee_work_items (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  studio_id uuid not null,
  seq text,
  sku text,
  platform text,
  name text not null,
  url text,
  spec text,
  price numeric(14, 2),
  constraint employee_work_items_name_not_blank check (btrim(name) <> ''),
  constraint employee_work_items_price_non_negative check (price is null or price >= 0),
  foreign key (batch_id, studio_id)
    references employee_work_batches(id, studio_id) on delete cascade
);

-- 选品定价批次
create table pricing_batches (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  file_name text not null,
  uploaded_by uuid not null references app_users(id) on delete restrict,
  total_rows integer not null default 0,
  archived_at timestamptz,
  archived_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_batches_file_name_not_blank check (btrim(file_name) <> ''),
  constraint pricing_batches_file_name_length check (char_length(file_name) between 1 and 255),
  constraint pricing_batches_total_rows_range check (total_rows between 0 and 50000),
  unique (id, studio_id)
);

-- 选品定价明细（batch_id 必填，组合外键防止跨工作室关联）
create table pricing_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  studio_id uuid not null,
  store text,
  product_name text not null,
  supplier_sku text,
  purchase_price numeric(14, 2),
  weight_kg numeric(10, 3),
  local_sku text,
  name_abbreviation text,
  sku_prefix text,
  selling_price numeric(14, 2),
  actual_margin_rate numeric(7, 4),
  breakeven_selling_price numeric(14, 2),
  price_check boolean not null default false,
  weight_check boolean not null default false,
  breakeven_profit numeric(14, 2),
  breakeven_margin_rate numeric(7, 4),
  price_1 numeric(14, 2),
  shipping_fee numeric(14, 2),
  commission_rate numeric(7, 4),
  return_rate numeric(7, 4),
  source_url text,
  created_by uuid not null references app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_items_product_name_not_blank check (btrim(product_name) <> ''),
  constraint pricing_items_actual_margin_rate_range check (actual_margin_rate between 0 and 1),
  constraint pricing_items_breakeven_margin_rate_range check (breakeven_margin_rate between 0 and 1),
  constraint pricing_items_commission_rate_range check (commission_rate between 0 and 1),
  constraint pricing_items_return_rate_range check (return_rate between 0 and 1),
  constraint pricing_items_purchase_price_non_negative check (purchase_price is null or purchase_price >= 0),
  constraint pricing_items_weight_kg_non_negative check (weight_kg is null or weight_kg >= 0),
  constraint pricing_items_selling_price_non_negative check (selling_price is null or selling_price >= 0),
  constraint pricing_items_breakeven_selling_price_non_negative check (breakeven_selling_price is null or breakeven_selling_price >= 0),
  constraint pricing_items_breakeven_profit_non_negative check (breakeven_profit is null or breakeven_profit >= 0),
  constraint pricing_items_price_1_non_negative check (price_1 is null or price_1 >= 0),
  constraint pricing_items_shipping_fee_non_negative check (shipping_fee is null or shipping_fee >= 0),
  foreign key (batch_id, studio_id)
    references pricing_batches(id, studio_id) on delete restrict
);

-- 商品导入批次（导入状态与回滚归档）
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  file_name text not null,
  status text not null default 'pending',
  total_rows integer not null default 0,
  success_rows integer not null default 0,
  failed_rows integer not null default 0,
  error_rows jsonb not null default '[]'::jsonb,
  created_by uuid not null references app_users(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint import_batches_file_name_not_blank check (btrim(file_name) <> ''),
  constraint import_batches_file_name_length check (char_length(file_name) between 1 and 255),
  constraint import_batches_status_check check (status in ('pending', 'processing', 'succeeded', 'partial_failed', 'failed')),
  constraint import_batches_total_rows_range check (total_rows between 0 and 50000),
  constraint import_batches_counts_non_negative check (success_rows >= 0 and failed_rows >= 0),
  unique (id, studio_id)
);

-- 商品库（商品名与货号支持模糊搜索，内部备注供客服跟进）
create table products (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  studio_id uuid not null,
  seq text,
  sku text,
  platform text,
  name text not null,
  url text,
  spec text,
  price numeric(14, 2),
  internal_note text,
  created_by uuid not null references app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank check (btrim(name) <> ''),
  constraint products_price_non_negative check (price is null or price >= 0),
  foreign key (batch_id, studio_id)
    references import_batches(id, studio_id) on delete restrict
);

-- 统一 updated_at 触发器
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger app_users_set_updated_at before update on app_users
  for each row execute function set_updated_at();
create trigger studios_set_updated_at before update on studios
  for each row execute function set_updated_at();
create trigger employees_set_updated_at before update on employees
  for each row execute function set_updated_at();
create trigger employee_work_batches_set_updated_at before update on employee_work_batches
  for each row execute function set_updated_at();
create trigger pricing_batches_set_updated_at before update on pricing_batches
  for each row execute function set_updated_at();
create trigger pricing_items_set_updated_at before update on pricing_items
  for each row execute function set_updated_at();
create trigger import_batches_set_updated_at before update on import_batches
  for each row execute function set_updated_at();
create trigger products_set_updated_at before update on products
  for each row execute function set_updated_at();

-- 员工工作：按工作室 + 员工 + 日期分页，日期倒序
create index employee_work_batches_studio_employee_date_idx
  on employee_work_batches (studio_id, employee_name, work_date desc, id desc);
create index employee_work_batches_studio_work_date_idx
  on employee_work_batches (studio_id, work_date desc, id desc);
create index employee_work_batches_studio_created_at_idx
  on employee_work_batches (studio_id, created_at desc);
create index employee_work_batches_uploaded_by_idx
  on employee_work_batches (uploaded_by);

create index employee_work_items_studio_batch_id_idx
  on employee_work_items (studio_id, batch_id, id desc);
create index employee_work_items_studio_sku_idx
  on employee_work_items (studio_id, sku);
create index employee_work_items_sku_trgm_idx
  on employee_work_items using gin (sku gin_trgm_ops, name gin_trgm_ops);

-- 选品定价：工作室 + 店铺 / 批次查询
create index pricing_items_studio_store_idx
  on pricing_items (studio_id, store);
create index pricing_items_studio_batch_id_idx
  on pricing_items (studio_id, batch_id);
create index pricing_items_studio_supplier_sku_idx
  on pricing_items (studio_id, supplier_sku);
create index pricing_items_studio_created_at_idx
  on pricing_items (studio_id, created_at);
create index pricing_batches_studio_created_at_idx
  on pricing_batches (studio_id, created_at desc);
create index pricing_batches_uploaded_by_idx
  on pricing_batches (uploaded_by);

-- 定价关键词模糊搜索（SKU、商品名、店铺）
create index pricing_items_keyword_trgm_idx
  on pricing_items using gin (
    product_name gin_trgm_ops,
    supplier_sku gin_trgm_ops,
    local_sku gin_trgm_ops,
    name_abbreviation gin_trgm_ops,
    sku_prefix gin_trgm_ops,
    store gin_trgm_ops
  );

-- 商品库：工作室 + 创建时间分页，SKU 精确与模糊索引
create index products_studio_created_at_idx
  on products (studio_id, created_at desc, id desc);
create index products_studio_sku_idx
  on products (studio_id, sku);
create index products_studio_created_by_idx
  on products (studio_id, created_by);
create index products_sku_name_trgm_idx
  on products using gin (sku gin_trgm_ops, name gin_trgm_ops);
create index import_batches_studio_created_at_idx
  on import_batches (studio_id, created_at desc);
