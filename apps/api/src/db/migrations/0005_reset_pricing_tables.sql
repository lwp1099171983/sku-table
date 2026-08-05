drop table if exists pricing_items;
drop table if exists pricing_batches;
drop table if exists ozon_product_pricing;
drop table if exists ozon_statistics_batches;

create table pricing_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  uploaded_by uuid not null references app_users(id) on delete restrict,
  total_rows integer not null default 0,
  created_at timestamptz not null default now(),
  constraint pricing_batches_file_name_not_blank check (btrim(file_name) <> ''),
  constraint pricing_batches_total_rows_non_negative check (total_rows >= 0)
);

create index pricing_batches_uploaded_by_idx
  on pricing_batches (uploaded_by);
create index pricing_batches_created_at_idx
  on pricing_batches (created_at);

create table pricing_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references pricing_batches(id) on delete restrict,
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
  constraint pricing_items_actual_margin_rate_range check (actual_margin_rate between 0 and 1),
  constraint pricing_items_breakeven_margin_rate_range check (breakeven_margin_rate between 0 and 1),
  constraint pricing_items_commission_rate_range check (commission_rate between 0 and 1),
  constraint pricing_items_return_rate_range check (return_rate between 0 and 1)
);

create index pricing_items_store_idx on pricing_items (store);
create index pricing_items_supplier_sku_idx on pricing_items (supplier_sku);
create index pricing_items_local_sku_idx on pricing_items (local_sku);
create index pricing_items_created_by_idx on pricing_items (created_by);
create index pricing_items_batch_id_idx on pricing_items (batch_id);
