create table if not exists employee_work_batches (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  employee_id uuid references app_users(id) on delete set null,
  work_date date not null,
  file_name text not null,
  uploaded_by uuid not null references app_users(id) on delete restrict,
  total_rows integer not null default 0,
  created_at timestamptz not null default now(),
  constraint employee_work_batches_employee_name_not_blank check (btrim(employee_name) <> ''),
  constraint employee_work_batches_file_name_not_blank check (btrim(file_name) <> ''),
  constraint employee_work_batches_total_rows_non_negative check (total_rows >= 0)
);

create table if not exists employee_work_items (
  id bigint generated always as identity primary key,
  batch_id uuid not null references employee_work_batches(id) on delete cascade,
  seq text,
  sku text,
  platform text,
  name text not null,
  url text,
  spec text,
  price numeric(14, 2),
  constraint employee_work_items_name_not_blank check (btrim(name) <> '')
);

create index if not exists employee_work_batches_employee_date_idx
  on employee_work_batches (employee_name, work_date);
create index if not exists employee_work_batches_work_date_idx
  on employee_work_batches (work_date);
create index if not exists employee_work_batches_uploaded_by_idx
  on employee_work_batches (uploaded_by);
create index if not exists employee_work_items_batch_id_idx
  on employee_work_items (batch_id);
create index if not exists employee_work_items_sku_idx
  on employee_work_items (sku);

create table if not exists ozon_statistics_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  uploaded_by uuid not null references app_users(id) on delete restrict,
  total_rows integer not null default 0,
  created_at timestamptz not null default now(),
  constraint ozon_statistics_batches_file_name_not_blank check (btrim(file_name) <> ''),
  constraint ozon_statistics_batches_total_rows_non_negative check (total_rows >= 0)
);

create index if not exists ozon_statistics_batches_uploaded_by_idx
  on ozon_statistics_batches (uploaded_by);
create index if not exists ozon_statistics_batches_created_at_idx
  on ozon_statistics_batches (created_at);

alter table ozon_product_pricing
  add column if not exists batch_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ozon_product_pricing_batch_id_fkey'
      and conrelid = 'ozon_product_pricing'::regclass
  ) then
    alter table ozon_product_pricing
      add constraint ozon_product_pricing_batch_id_fkey
      foreign key (batch_id) references ozon_statistics_batches(id) on delete restrict;
  end if;
end $$;

create index if not exists ozon_product_pricing_batch_id_idx
  on ozon_product_pricing (batch_id);
