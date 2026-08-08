import type { PermissionCode, UserRole } from '@sku-table/shared'

// 权限目录：由 seed 管理，v1 不开放任意创建权限码
export const PERMISSION_CATALOG: ReadonlyArray<{ code: PermissionCode; name: string; description: string }> = [
  { code: 'shop.manage', name: '店铺管理', description: '创建和管理店铺。' },
  { code: 'member.read', name: '成员查看', description: '查看店铺成员。' },
  { code: 'member.manage', name: '成员管理', description: '添加、修改和移除店铺成员。' },
  { code: 'user.manage', name: '账号管理', description: '查看账号、重置密码和停用/启用账号。' },
  { code: 'employee_work.read', name: '员工工作查看', description: '查看员工工作记录。' },
  { code: 'employee_work.import', name: '员工工作导入', description: '导入员工工作 Excel。' },
  { code: 'employee_work.delete', name: '员工工作删除', description: '删除员工工作数据。' },
  { code: 'employee_work.rollback', name: '员工工作回滚', description: '按批次回滚员工工作数据。' },
  { code: 'ledger.read', name: '台账查看', description: '查看订单台账。' },
  { code: 'ledger.stats.read', name: '台账统计查看', description: '查看订单台账统计数据。' },
  { code: 'ledger.import', name: '台账导入', description: '导入订单台账 Excel。' },
  { code: 'ledger.delete', name: '台账删除', description: '删除台账数据。' },
]

// 预置角色目录
export const ROLE_CATALOG: ReadonlyArray<{ code: UserRole; name: string; description: string }> = [
  { code: 'admin', name: '管理员', description: '全局账号，拥有全部权限，可查看全部店铺。' },
  { code: 'leader', name: '组长', description: '按店铺授权，可查看和导入员工工作与台账明细，不含台账统计。' },
  { code: 'customer', name: '客服', description: '按店铺授权，只能查看员工工作记录。' },
]

// 角色-权限矩阵（admin 拥有全部，delete 权限不预置给任何角色）
export const ROLE_PERMISSIONS: Record<UserRole, readonly PermissionCode[]> = {
  admin: PERMISSION_CATALOG.map((permission) => permission.code),
  leader: [
    'employee_work.read',
    'employee_work.import',
    'ledger.read',
    'ledger.import',
  ],
  customer: [
    'employee_work.read',
  ],
}

export const ALL_ROLE_CODES: readonly UserRole[] = ['admin', 'leader', 'customer']

// 允许管理员通过成员管理单独开通/关闭的用户级权限（删除类）
export const MEMBER_ASSIGNABLE_PERMISSIONS: readonly PermissionCode[] = [
  'employee_work.delete',
  'ledger.delete',
]

// 成员管理可分配的角色（admin 通过注册管理员页创建，不在此列）
export const MEMBER_ROLE_CODES: readonly UserRole[] = ['leader', 'customer']
