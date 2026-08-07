-- 店铺体系重构迁移：工作室→店铺、角色改名、删除商品库、新增台账
-- 兼容旧库（已有 studios 等表）与空库（新基线已建 shops，本迁移全部为条件空操作）

-- 1. 表改名：studios → shops 系列
do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'studios') then
    alter table studios rename to shops;
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'studio_members') then
    alter table studio_members rename to shop_members;
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'studio_member_roles') then
    alter table studio_member_roles rename to shop_member_roles;
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'studio_member_permissions') then
    alter table studio_member_permissions rename to shop_member_permissions;
  end if;
end $$;

-- 2. 业务字段改名：studio_id → shop_id
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'shop_members' and column_name = 'studio_id') then
    alter table shop_members rename column studio_id to shop_id;
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'shop_member_roles' and column_name = 'studio_id') then
    alter table shop_member_roles rename column studio_id to shop_id;
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'shop_member_permissions' and column_name = 'studio_id') then
    alter table shop_member_permissions rename column studio_id to shop_id;
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'employees' and column_name = 'studio_id') then
    alter table employees rename column studio_id to shop_id;
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'employee_work_batches' and column_name = 'studio_id') then
    alter table employee_work_batches rename column studio_id to shop_id;
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'employee_work_items' and column_name = 'studio_id') then
    alter table employee_work_items rename column studio_id to shop_id;
  end if;
end $$;

-- 3. 删除商品库（旧库清理；新库本来就没有）
drop table if exists products;
drop table if exists import_batches;

-- 4. 管理员标记
alter table app_users add column if not exists is_admin boolean not null default false;

-- 5. 索引/触发器改名（仅旧库存在旧名）
do $$ begin
  if exists (select 1 from pg_indexes where indexname = 'employees_studio_name_unique') then
    alter index employees_studio_name_unique rename to employees_shop_name_unique;
  end if;
end $$;

do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'studios_set_updated_at') then
    alter trigger studios_set_updated_at on shops rename to shops_set_updated_at;
  end if;
end $$;

-- 6. 旧角色/权限清理：旧 owner 升级为全局管理员，删除旧角色码与商品权限
do $$ begin
  if exists (select 1 from roles where code = 'owner') then
    update app_users set is_admin = true
      where id in (select distinct user_id from shop_member_roles where role_code = 'owner');
    delete from shop_member_permissions
      where permission_code like 'product.%' or permission_code = 'studio.manage' or permission_code like 'pricing.%';
    delete from permissions
      where code like 'product.%' or code = 'studio.manage' or code like 'pricing.%';
    delete from roles where code in ('owner', 'selector', 'operator');
  end if;
end $$;

-- 7. 台账表（旧库新增；新库基线已建，条件跳过）
create table if not exists ledger_batches (
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

create table if not exists ledger_items (
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

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'ledger_batches_set_updated_at') then
    create trigger ledger_batches_set_updated_at before update on ledger_batches
      for each row execute function set_updated_at();
  end if;
end $$;

create index if not exists ledger_batches_shop_created_at_idx
  on ledger_batches (shop_id, created_at desc);
create index if not exists ledger_items_shop_batch_id_idx
  on ledger_items (shop_id, batch_id, id desc);
create index if not exists ledger_items_shop_month_idx
  on ledger_items (shop_id, month);
create index if not exists ledger_items_shop_order_no_idx
  on ledger_items (shop_id, order_no);
