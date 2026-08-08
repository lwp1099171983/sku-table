-- RBAC 目录属于应用运行必需数据，随迁移发布，不能依赖可选 seed。

insert into roles (code, name, description) values
  ('admin', '管理员', '全局账号，拥有全部权限，可查看全部店铺。'),
  ('leader', '组长', '按店铺授权，可查看和导入员工工作与台账。'),
  ('customer', '客服', '按店铺授权，只能查看员工工作记录。')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

insert into permissions (code, name, description) values
  ('shop.manage', '店铺管理', '创建和管理店铺。'),
  ('member.read', '成员查看', '查看店铺成员。'),
  ('member.manage', '成员管理', '添加、修改和移除店铺成员。'),
  ('user.manage', '账号管理', '查看账号、重置密码和停用/启用账号。'),
  ('employee_work.read', '员工工作查看', '查看员工工作记录。'),
  ('employee_work.import', '员工工作导入', '导入员工工作 Excel。'),
  ('employee_work.delete', '员工工作删除', '删除员工工作数据。'),
  ('employee_work.rollback', '员工工作回滚', '按批次回滚员工工作数据。'),
  ('ledger.read', '台账查看', '查看订单台账。'),
  ('ledger.import', '台账导入', '导入订单台账 Excel。'),
  ('ledger.delete', '台账删除', '删除台账数据。')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

insert into role_permissions (role_code, permission_code) values
  ('admin', 'shop.manage'),
  ('admin', 'member.read'),
  ('admin', 'member.manage'),
  ('admin', 'user.manage'),
  ('admin', 'employee_work.read'),
  ('admin', 'employee_work.import'),
  ('admin', 'employee_work.delete'),
  ('admin', 'employee_work.rollback'),
  ('admin', 'ledger.read'),
  ('admin', 'ledger.import'),
  ('admin', 'ledger.delete'),
  ('leader', 'employee_work.read'),
  ('leader', 'employee_work.import'),
  ('leader', 'ledger.read'),
  ('leader', 'ledger.import'),
  ('customer', 'employee_work.read')
on conflict (role_code, permission_code) do nothing;
