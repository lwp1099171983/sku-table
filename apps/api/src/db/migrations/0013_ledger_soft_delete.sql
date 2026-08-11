-- 台账删除改为软删除：保留原始记录与删除操作者，管理员可从回收站恢复。
alter table ledger_items
  add column deleted_at timestamptz,
  add column deleted_by uuid references app_users(id) on delete set null;

-- 已删除订单允许重新导入；恢复时由该唯一约束阻止与当前台账重复的订单号。
drop index if exists ledger_items_order_no_unique;
create unique index ledger_items_order_no_active_unique
  on ledger_items (order_no)
  where order_no is not null and deleted_at is null;

-- 当前台账列表与删除查询均按店铺和批次过滤，回收站按删除时间倒序查看。
create index ledger_items_active_shop_batch_id_idx
  on ledger_items (shop_id, batch_id, id desc)
  where deleted_at is null;
create index ledger_items_deleted_at_idx
  on ledger_items (deleted_at desc)
  where deleted_at is not null;
