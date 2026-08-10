-- 发布前必须先执行 pg_dump：本迁移会删除历史重复订单，仅保留最早记录。

insert into permissions (code, name, description) values
  ('ledger.edit', '台账编辑', '修改台账重量并重新计算相关数据。')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

insert into role_permissions (role_code, permission_code)
values ('admin', 'ledger.edit')
on conflict (role_code, permission_code) do nothing;

alter table ledger_items rename column tracking_no to sku;

-- 订单号按导入规范去除首尾空格；空订单号不参与唯一约束。
update ledger_items
set order_no = nullif(btrim(order_no), '')
where order_no is distinct from nullif(btrim(order_no), '');

-- 全系统订单号唯一：保留最早写入的记录。
with ranked as (
  select
    id,
    row_number() over (partition by order_no order by id) as duplicate_rank
  from ledger_items
  where order_no is not null
)
delete from ledger_items
using ranked
where ledger_items.id = ranked.id
  and ranked.duplicate_rank > 1;

-- 删除重复明细后，以实际明细数修正所有导入批次。
update ledger_batches
set
  total_rows = (
    select count(*)::integer
    from ledger_items
    where ledger_items.batch_id = ledger_batches.id
  ),
  updated_at = now();

drop index if exists ledger_items_shop_order_no_idx;
create unique index ledger_items_order_no_unique
  on ledger_items (order_no)
  where order_no is not null;
