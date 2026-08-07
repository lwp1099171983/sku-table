-- 导入幂等：批次表记录解析后业务数据指纹（同店铺+同指纹只允许一个批次），同店铺+同指纹只允许一个批次
alter table employee_work_batches add column if not exists idempotency_key text;
alter table ledger_batches add column if not exists idempotency_key text;

alter table employee_work_batches
  add constraint employee_work_batches_idempotency_key_check
  check (idempotency_key is null or (char_length(idempotency_key) between 1 and 128));
alter table ledger_batches
  add constraint ledger_batches_idempotency_key_check
  check (idempotency_key is null or (char_length(idempotency_key) between 1 and 128));

create unique index if not exists employee_work_batches_shop_idempotency_unique
  on employee_work_batches (shop_id, idempotency_key);
create unique index if not exists ledger_batches_shop_idempotency_unique
  on ledger_batches (shop_id, idempotency_key);
