-- 台账统计单独授权：管理员可查看，组长仅保留台账明细查看权限。
insert into permissions (code, name, description) values
  ('ledger.stats.read', '台账统计查看', '查看订单台账统计数据。')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

insert into role_permissions (role_code, permission_code)
values ('admin', 'ledger.stats.read')
on conflict (role_code, permission_code) do nothing;

update roles
set description = '按店铺授权，可查看和导入员工工作与台账明细，不含台账统计。'
where code = 'leader';
