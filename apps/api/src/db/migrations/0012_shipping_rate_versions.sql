-- 物流资费改为数据库版本化管理。历史版本不删除，保证已重算台账可追溯。
create table shipping_rate_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_file_name text not null,
  is_active boolean not null default false,
  created_by uuid references app_users(id) on delete set null,
  activated_by uuid references app_users(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_rate_versions_name_not_blank check (btrim(name) <> ''),
  constraint shipping_rate_versions_name_length check (char_length(name) between 1 and 100),
  constraint shipping_rate_versions_source_file_name_not_blank check (btrim(source_file_name) <> ''),
  constraint shipping_rate_versions_source_file_name_length check (char_length(source_file_name) between 1 and 255)
);

-- 部分唯一索引保证最多只有一个启用版本。
create unique index shipping_rate_versions_one_active_unique
  on shipping_rate_versions (is_active)
  where is_active;
create index shipping_rate_versions_created_at_idx
  on shipping_rate_versions (created_at desc);

create table shipping_rates (
  id bigint generated always as identity primary key,
  version_id uuid not null references shipping_rate_versions(id) on delete restrict,
  channel_name text not null,
  base_price numeric(14, 4) not null,
  price_per_gram numeric(14, 4) not null,
  min_weight integer not null,
  max_weight integer not null,
  constraint shipping_rates_channel_name_not_blank check (btrim(channel_name) <> ''),
  constraint shipping_rates_channel_name_length check (char_length(channel_name) between 1 and 200),
  constraint shipping_rates_base_price_non_negative check (base_price >= 0),
  constraint shipping_rates_price_per_gram_non_negative check (price_per_gram >= 0),
  constraint shipping_rates_weight_range check (min_weight >= 0 and max_weight >= min_weight)
);

create unique index shipping_rates_version_channel_unique
  on shipping_rates (version_id, lower(channel_name));
create index shipping_rates_version_id_idx on shipping_rates (version_id);

alter table ledger_items
  add column shipping_rate_version_id uuid references shipping_rate_versions(id) on delete restrict;
create index ledger_items_shipping_rate_version_idx
  on ledger_items (shipping_rate_version_id)
  where shipping_rate_version_id is not null;

create trigger shipping_rate_versions_set_updated_at before update on shipping_rate_versions
  for each row execute function set_updated_at();

-- 迁入原 shippingRates.ts 中的资费表（来源：2333).xlsx / 物流资费表 / 第 3~91 行）。
with initial_version as (
  insert into shipping_rate_versions (name, source_file_name, is_active, activated_at)
  values ('初始资费表（2026-08-06）', '2333).xlsx', true, now())
  returning id
)
insert into shipping_rates (version_id, channel_name, base_price, price_per_gram, min_weight, max_weight)
select initial_version.id, rules.channel_name, rules.base_price, rules.price_per_gram, rules.min_weight, rules.max_weight
from initial_version
cross join (
  values
    ('UNI Express Extra Small', 3, 0.045, 1, 549),
    ('UNI Standard Extra Small', 3, 0.035, 1, 549),
    ('UNI Economy Extra Small', 3, 0.025, 1, 549),
    ('UNI Express Budget', 23, 0.033, 501, 25000),
    ('UNI Standard Budget', 23, 0.025, 501, 25000),
    ('UNI Economy Budget', 23, 0.017, 501, 25000),
    ('UNI Express Small', 16, 0.045, 1, 2000),
    ('UNI Standard Small', 16, 0.035, 1, 2000),
    ('UNI Economy Small', 16, 0.025, 1, 2000),
    ('UNI Express Big', 36, 0.033, 2001, 25000),
    ('UNI Standard Big', 36, 0.025, 2001, 25000),
    ('UNI Economy Big', 36, 0.017, 2001, 25000),
    ('CEL Express Extra Small', 3, 0.045, 1, 528),
    ('CEL Standard Extra Small', 3, 0.035, 1, 528),
    ('CEL Economy Extra Small', 3, 0.025, 1, 528),
    ('CEL Express Budget', 23, 0.033, 501, 25000),
    ('CEL Standard Budget', 23, 0.025, 501, 25000),
    ('CEL Economy Budget', 23, 0.017, 501, 25000),
    ('CEL Express Small', 16, 0.045, 1, 2060),
    ('CEL Standard Small', 16, 0.035, 1, 2060),
    ('CEL Economy Small', 16, 0.025, 1, 2060),
    ('CEL Express Big', 36, 0.033, 2001, 25000),
    ('CEL Standard Big', 36, 0.025, 2001, 25000),
    ('CEL Economy Big', 36, 0.017, 2001, 25000),
    ('CEL Express Premium Small', 22, 0.045, 1, 5000),
    ('CEL Standard Premium Small', 22, 0.045, 1, 5000),
    ('CEL Economy Premium Small', 22, 0.045, 1, 5000),
    ('CEL Express Premium Big', 62, 0.033, 5001, 25000),
    ('CEL Standard Premium Big', 62, 0.028, 5001, 25000),
    ('CEL Economy Premium Big', 62, 0.023, 5001, 25000),
    ('UNI Express Extra Small UNE', 3, 0.045, 1, 549),
    ('UNI Standard Extra Small UNI', 3, 0.035, 1, 549),
    ('UNI Economy Extra Small UNW', 3, 0.025, 1, 549),
    ('UNI Express Budget UND', 23, 0.033, 501, 25000),
    ('UNI Standard Budget UNQ', 23, 0.025, 501, 25000),
    ('UNI Economy Budget UNZ', 23, 0.017, 501, 25000),
    ('UNI Express Small UNA', 16, 0.045, 1, 2060),
    ('UNI Standard Small UNY', 16, 0.035, 1, 2060),
    ('UNI Economy Small UNZ', 16, 0.025, 1, 2060),
    ('UNI Express Big UND', 36, 0.033, 2001, 25000),
    ('UNI Standard Big UNQ', 36, 0.025, 2001, 25000),
    ('UNI Economy Big UNZ', 36, 0.017, 2001, 25000),
    ('UNI Economy Budget UNP', 23, 0.017, 501, 25000),
    ('GUOO Express Extra Small', 3, 0.045, 1, 549),
    ('GUOO Standard Extra Small', 3, 0.035, 1, 549),
    ('GUOO Economy Extra Small', 3, 0.025, 1, 549),
    ('GUOO Express Budget', 23, 0.033, 501, 25000),
    ('GUOO Standard Budget', 23, 0.025, 501, 25000),
    ('GUOO Economy Budget', 23, 0.017, 501, 25000),
    ('GUOO Express Small', 16, 0.045, 1, 2000),
    ('GUOO Standard Small', 16, 0.035, 1, 2000),
    ('GUOO Economy Small', 16, 0.025, 1, 2000),
    ('GUOO Express Big', 36, 0.033, 2001, 25000),
    ('GUOO Standard Big', 36, 0.025, 2001, 25000),
    ('GUOO Economy Big', 36, 0.017, 2001, 25000),
    ('China Post to PUDO Standard', 1.9, 0.067, 1, 500),
    ('China Post to PUDO Economy', 1.9, 0.026, 1, 500),
    ('RETS Express Extra Small', 3.42, 0.05, 1, 500),
    ('RETS Express Small', 18.02, 0.05, 1, 500),
    ('ATC Express Extra Small', 3.37, 0.0505, 1, 500),
    ('ATC Standard Extra Small', 3.37, 0.0393, 1, 500),
    ('ATC Economy Extra Small', 3.37, 0.0281, 1, 500),
    ('ATC Express Budget', 3.37, 0.0505, 501, 25000),
    ('ATC Standard Budget', 3.37, 0.0393, 501, 25000),
    ('ATC Economy Budget', 3.37, 0.0281, 501, 25000),
    ('ATC Express Small', 17.97, 0.0505, 1, 2000),
    ('ATC Standard Small', 17.97, 0.0393, 1, 2000),
    ('ATC Economy Small', 17.97, 0.0281, 1, 2000),
    ('ATC Express Big', 40.44, 0.0371, 2001, 25000),
    ('ATC Standard Big', 40.44, 0.0281, 2001, 25000),
    ('ATC Economy Big', 40.44, 0.0191, 2001, 25000),
    ('ATC Express Premium Small', 24.71, 0.0505, 1, 5000),
    ('ATC Standard Premium Small', 24.71, 0.0393, 1, 5000),
    ('ATC Economy Premium Small', 24.71, 0.0281, 1, 5000),
    ('ATC Express Premium Big', 69.64, 0.0371, 5001, 25000),
    ('ATC Standard Premium Big', 69.64, 0.0314, 5001, 25000),
    ('ATC Economy Premium Big', 69.64, 0.0258, 5001, 25000),
    ('OYX Express Extra Small', 3, 0.045, 1, 500),
    ('OYX Standard Extra Small', 3, 0.035, 1, 500),
    ('OYX Economy Extra Small', 3, 0.025, 1, 500),
    ('OYX Express Budget', 23, 0.033, 501, 25000),
    ('OYX Standard Budget', 23, 0.025, 501, 25000),
    ('OYX Economy Budget', 23, 0.017, 501, 25000),
    ('OYX Express Small', 16, 0.045, 1, 2000),
    ('OYX Standard Small', 16, 0.035, 1, 2000),
    ('OYX Economy Small', 16, 0.025, 1, 2000),
    ('OYX Express Big', 36, 0.033, 2001, 25000),
    ('OYX Standard Big', 36, 0.025, 2001, 25000),
    ('OYX Economy Big', 36, 0.017, 2001, 25000)
) as rules (channel_name, base_price, price_per_gram, min_weight, max_weight);
