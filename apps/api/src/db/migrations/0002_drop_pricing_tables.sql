-- 移除选品定价功能：删除定价批次与明细表（已应用旧基线迁移的数据库由此迁移清理）
drop table if exists pricing_items;
drop table if exists pricing_batches;
