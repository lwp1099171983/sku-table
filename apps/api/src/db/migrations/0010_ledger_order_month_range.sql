-- 台账月份区间筛选：保存标准化订单年月，避免基于文本日期动态解析
alter table ledger_items
  add column if not exists order_month text;

-- 回填历史数据，兼容 2026-08、2026/08 和 2026年8月开头的订单日期
update ledger_items
set order_month =
  substring(btrim(order_date) from '^([0-9]{4})')
  || '-'
  || lpad(
    substring(btrim(order_date) from '^[0-9]{4}[-/年][[:space:]]*(0?[1-9]|1[0-2])'),
    2,
    '0'
  )
where order_month is null
  and btrim(order_date) ~ '^[0-9]{4}[-/年][[:space:]]*(0?[1-9]|1[0-2])';

create index if not exists ledger_items_order_month_idx
  on ledger_items (order_month);
