# 数据访问层

这里放 Drizzle schema、迁移和 repository。数据库连接只在 API 内部使用，禁止前端或共享包引入数据库驱动。

当前表：

- `app_users`：登录成员和角色；
- `employee_work_batches`：员工工作文件批次；
- `employee_work_items`：员工每日采集商品明细；
- `pricing_batches`：选品定价统计文件批次；
- `pricing_items`：选品定价、利润和费用统计明细。

执行 `pnpm db:migrate` 会按文件名顺序执行未完成的 SQL 迁移。

`0005_reset_pricing_tables.sql` 会删除并重建旧的 `ozon_*` 和当前 `pricing_*` 表，仅清理选品定价假数据，不影响用户和员工工作记录。
