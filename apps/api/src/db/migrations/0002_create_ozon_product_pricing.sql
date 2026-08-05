create table if not exists ozon_product_pricing (
  id uuid primary key default gen_random_uuid(),
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
  constraint ozon_product_pricing_product_name_not_blank check (btrim(product_name) <> ''),
  constraint ozon_product_pricing_actual_margin_rate_range check (actual_margin_rate between 0 and 1),
  constraint ozon_product_pricing_breakeven_margin_rate_range check (breakeven_margin_rate between 0 and 1),
  constraint ozon_product_pricing_commission_rate_range check (commission_rate between 0 and 1),
  constraint ozon_product_pricing_return_rate_range check (return_rate between 0 and 1)
);

create index if not exists ozon_product_pricing_store_idx on ozon_product_pricing (store);
create index if not exists ozon_product_pricing_supplier_sku_idx on ozon_product_pricing (supplier_sku);
create index if not exists ozon_product_pricing_local_sku_idx on ozon_product_pricing (local_sku);
create index if not exists ozon_product_pricing_created_by_idx on ozon_product_pricing (created_by);
