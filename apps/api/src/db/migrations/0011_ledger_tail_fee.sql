-- 尾程比例替代旧赔偿字段，所有历史记录统一按 2% 计。
alter table ledger_items rename column compensation to tail_fee;

update ledger_items
set tail_fee = '2%';

-- 对有效金额重新计算：尾程先换算为卢布，限制在 15~200 卢布后换回人民币。
with cleaned as (
  select
    id,
    nullif(regexp_replace(sale_price, '[￥¥,，[:space:]]', '', 'g'), '') as sale_value,
    nullif(regexp_replace(purchase_amount, '[￥¥,，[:space:]]', '', 'g'), '') as purchase_value,
    nullif(regexp_replace(freight, '[￥¥,，[:space:]]', '', 'g'), '') as freight_value,
    nullif(regexp_replace(commission, '[￥¥,，[:space:]]', '', 'g'), '') as commission_value
  from ledger_items
), numeric_values as (
  select
    id,
    case when sale_value ~ '^[+-]?([0-9]+(\.[0-9]+)?|\.[0-9]+)$' then sale_value::numeric end as sale_amount,
    case when purchase_value ~ '^[+-]?([0-9]+(\.[0-9]+)?|\.[0-9]+)$' then purchase_value::numeric end as purchase_amount,
    case when freight_value ~ '^[+-]?([0-9]+(\.[0-9]+)?|\.[0-9]+)$' then freight_value::numeric end as freight_amount,
    case when commission_value ~ '^[+-]?([0-9]+(\.[0-9]+)?|\.[0-9]+)$' then commission_value::numeric end as commission_amount
  from cleaned
), gross_values as (
  select
    id,
    sale_amount,
    freight_amount,
    commission_amount,
    round(least(greatest(sale_amount / 0.0822 * 0.02, 15::numeric), 200::numeric) * 0.0822, 2) as tail_amount,
    round(sale_amount - purchase_amount - round(least(greatest(sale_amount / 0.0822 * 0.02, 15::numeric), 200::numeric) * 0.0822, 2), 2) as gross_profit
  from numeric_values
  where sale_amount is not null
    and purchase_amount is not null
), net_values as (
  select
    id,
    sale_amount,
    gross_profit,
    round(freight_amount, 2) as freight_amount,
    round(commission_amount, 2) as commission_amount,
    round(gross_profit - round(freight_amount, 2) - round(commission_amount, 2), 2) as net_profit
  from gross_values
  where freight_amount is not null
    and commission_amount is not null
), advertising_values as (
  select
    id,
    gross_profit,
    net_profit,
    round(sale_amount * 0.22, 2) as ad22,
    round(sale_amount * 0.30, 2) as ad30
  from net_values
)
update ledger_items as item
set
  gross_profit = coalesce(gross_values.gross_profit::text, item.gross_profit),
  net_profit = coalesce(advertising_values.net_profit::text, item.net_profit),
  ad22 = coalesce(advertising_values.ad22::text, item.ad22),
  ad22_net = coalesce(round(advertising_values.net_profit - advertising_values.ad22, 2)::text, item.ad22_net),
  ad30 = coalesce(advertising_values.ad30::text, item.ad30),
  ad30_net = coalesce(round(advertising_values.net_profit - advertising_values.ad30, 2)::text, item.ad30_net)
from gross_values
left join advertising_values on advertising_values.id = gross_values.id
where item.id = gross_values.id;
