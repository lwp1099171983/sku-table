-- 客服只要是启用店铺成员，即可查看并导入该店铺的员工工作数据。

insert into role_permissions (role_code, permission_code)
values ('customer', 'employee_work.import')
on conflict (role_code, permission_code) do nothing;

update roles
set description = '按店铺授权，可查看和导入员工工作记录。'
where code = 'customer';
