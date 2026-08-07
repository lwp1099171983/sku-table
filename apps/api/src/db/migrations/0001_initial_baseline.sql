-- 数据库与 RBAC 重建基线迁移（面向空库执行，店铺体系 + 员工工作 + 订单台账）

-- 扩展
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- 登录用户（is_admin 为全局管理员：看全部店铺、拥有全部权限）
create table app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  display_name text,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_lowercase check (email = lower(email)),
  constraint app_users_email_not_blank check (btrim(email) <> ''),
  constraint app_users_email_length check (char_length(email) <= 320)
);

create unique index if not exists app_users_email_unique on app_users (email);
create index if not exists app_users_active_email_idx on app_users (is_active, email);

-- 店铺（团队隔离，名称唯一）
create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shops_name_not_blank check (btrim(name) <> ''),
  constraint shops_name_length check (char_length(name) between 1 and 100)
);

create unique index if not exists shops_name_unique on shops (lower(name));

-- 店铺成员
create table shop_members (
  shop_id uuid not null references shops(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
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

-- 用户在店铺内的角色（可多角色）
create table shop_member_roles (
  shop_id uuid not null,
  user_id uuid not null,
  role_code text not null references roles(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id, role_code),
  foreign key (shop_id, user_id) references shop_members(shop_id, user_id) on delete cascade
);

-- 用户级直接权限（allow/deny，deny 优先于角色 allow；删除类权限靠这里开通）
create table shop_member_permissions (
  shop_id uuid not null,
  user_id uuid not null,
  permission_code text not null references permissions(code) on delete cascade,
  effect text not null default 'allow' check (effect in ('allow', 'deny')),
  granted_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id, permission_code),
  foreign key (shop_id, user_id) references shop_members(shop_id, user_id) on delete cascade
);

-- 员工实体（按店铺维护，员工名保持导入快照）
create table employees (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_name_not_blank check (btrim(name) <> ''),
  constraint employees_name_length check (char_length(name) between 1 and 100),
  unique (id, shop_id)
);

create unique index if not exists employees_shop_name_unique
  on employees (shop_id, lower(name));

-- 员工工作批次
create table employee_work_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
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
  unique (id, shop_id),
  foreign key (employee_id, shop_id) references employees(id, shop_id) on delete set null
);

-- 员工工作明细（组合外键防止跨店铺关联）
create table employee_work_items (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  shop_id uuid not null,
  seq text,
  sku text,
  platform text,
  name text not null,
  url text,
  spec text,
  price numeric(14, 2),
  constraint employee_work_items_name_not_blank check (btrim(name) <> ''),
  constraint employee_work_items_price_non_negative check (price is null or price >= 0),
  foreign key (batch_id, shop_id)
    references employee_work_batches(id, shop_id) on delete cascade
);

-- 台账批次
create table ledger_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  file_name text not null,
  uploaded_by uuid not null references app_users(id) on delete restrict,
  total_rows integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ledger_batches_file_name_not_blank check (btrim(file_name) <> ''),
  constraint ledger_batches_file_name_length check (char_length(file_name) between 1 and 255),
  constraint ledger_batches_total_rows_range check (total_rows between 0 and 50000),
  unique (id, shop_id)
);

-- 台账明细（25 个业务字段，含跟踪号；全部 text 保存原始值，公式列不重算）
create table ledger_items (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  shop_id uuid not null,
  seq text,
  month text,
  order_date text,
  order_no text,
  tracking_no text,
  sale_price text,
  quantity text,
  unit_price text,
  purchase_amount text,
  purchase_date text,
  purchase_platform text,
  purchase_order_no text,
  gross_profit text,
  channel_name text,
  package_weight text,
  freight text,
  commission text,
  net_profit text,
  ad22 text,
  ad22_net text,
  ad30 text,
  ad30_net text,
  compensation text,
  remark text,
  foreign key (batch_id, shop_id)
    references ledger_batches(id, shop_id) on delete cascade
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
create trigger shops_set_updated_at before update on shops
  for each row execute function set_updated_at();
create trigger employees_set_updated_at before update on employees
  for each row execute function set_updated_at();
create trigger employee_work_batches_set_updated_at before update on employee_work_batches
  for each row execute function set_updated_at();
create trigger ledger_batches_set_updated_at before update on ledger_batches
  for each row execute function set_updated_at();

-- 员工工作：按店铺 + 员工 + 日期分页，日期倒序
create index employee_work_batches_shop_employee_date_idx
  on employee_work_batches (shop_id, employee_name, work_date desc, id desc);
create index employee_work_batches_shop_work_date_idx
  on employee_work_batches (shop_id, work_date desc, id desc);
create index employee_work_batches_shop_created_at_idx
  on employee_work_batches (shop_id, created_at desc);
create index employee_work_batches_uploaded_by_idx
  on employee_work_batches (uploaded_by);

create index employee_work_items_shop_batch_id_idx
  on employee_work_items (shop_id, batch_id, id desc);
create index employee_work_items_shop_sku_idx
  on employee_work_items (shop_id, sku);
create index employee_work_items_sku_trgm_idx
  on employee_work_items using gin (sku gin_trgm_ops, name gin_trgm_ops);

-- 台账：店铺 + 月份 / 订单号检索
create index ledger_batches_shop_created_at_idx
  on ledger_batches (shop_id, created_at desc);
create index ledger_items_shop_batch_id_idx
  on ledger_items (shop_id, batch_id, id desc);
create index ledger_items_shop_month_idx
  on ledger_items (shop_id, month);
create index ledger_items_shop_order_no_idx
  on ledger_items (shop_id, order_no);
