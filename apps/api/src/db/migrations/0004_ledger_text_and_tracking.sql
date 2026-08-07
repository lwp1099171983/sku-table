-- 台账明细改为 text 保存原始值，并补充跟踪号（兼容已应用 0003 的数据库；新库基线已生效，本迁移为条件空操作）

-- 数值列改为 text（保留原值文本，如"超重"、"渠道不存在或公式错误"等公式错误文本）
alter table ledger_items alter column sale_price type text using sale_price::text;
alter table ledger_items alter column quantity type text using quantity::text;
alter table ledger_items alter column unit_price type text using unit_price::text;
alter table ledger_items alter column purchase_amount type text using purchase_amount::text;
alter table ledger_items alter column gross_profit type text using gross_profit::text;
alter table ledger_items alter column package_weight type text using package_weight::text;
alter table ledger_items alter column freight type text using freight::text;
alter table ledger_items alter column commission type text using commission::text;
alter table ledger_items alter column net_profit type text using net_profit::text;
alter table ledger_items alter column ad22 type text using ad22::text;
alter table ledger_items alter column ad22_net type text using ad22_net::text;
alter table ledger_items alter column ad30 type text using ad30::text;
alter table ledger_items alter column ad30_net type text using ad30_net::text;
alter table ledger_items alter column compensation type text using compensation::text;

-- 跟踪号
alter table ledger_items add column if not exists tracking_no text;
