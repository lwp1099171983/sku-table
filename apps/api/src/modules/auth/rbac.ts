import type { PermissionCode, UserRole } from '@sku-table/shared'

// 权限目录：由 seed 管理，v1 不开放任意创建权限码
export const PERMISSION_CATALOG: ReadonlyArray<{ code: PermissionCode; name: string; description: string }> = [
  { code: 'studio.manage', name: '工作室管理', description: '创建和管理工作室。' },
  { code: 'member.read', name: '成员查看', description: '查看工作室成员。' },
  { code: 'member.manage', name: '成员管理', description: '添加、修改和移除工作室成员。' },
  { code: 'employee_work.read', name: '员工工作查看', description: '查看员工工作记录。' },
  { code: 'employee_work.import', name: '员工工作导入', description: '导入员工工作 Excel。' },
  { code: 'employee_work.delete', name: '员工工作删除', description: '删除员工工作数据。' },
  { code: 'employee_work.rollback', name: '员工工作回滚', description: '按批次回滚员工工作数据。' },
  { code: 'pricing.read', name: '定价查看', description: '查看选品定价数据。' },
  { code: 'pricing.import', name: '定价导入', description: '导入选品定价 Excel。' },
  { code: 'pricing.edit', name: '定价编辑', description: '编辑定价原始字段。' },
  { code: 'pricing.delete', name: '定价删除', description: '删除定价数据。' },
  { code: 'pricing.rollback', name: '定价回滚', description: '按批次回滚定价数据。' },
  { code: 'product.read', name: '商品查看', description: '查看商品库。' },
  { code: 'product.import', name: '商品导入', description: '导入商品 Excel。' },
  { code: 'product.note.edit', name: '内部备注编辑', description: '编辑商品内部备注。' },
  { code: 'product.fields.edit', name: '商品字段编辑', description: '编辑商品原始字段。' },
  { code: 'product.delete', name: '商品删除', description: '删除商品。' },
  { code: 'product.rollback', name: '商品回滚', description: '按批次回滚商品数据。' },
]

// 预置角色目录
export const ROLE_CATALOG: ReadonlyArray<{ code: UserRole; name: string; description: string }> = [
  { code: 'owner', name: '负责人', description: '拥有全部权限。' },
  { code: 'selector', name: '选品员', description: '查看和导入员工工作、选品定价，查看商品，编辑内部备注。' },
  { code: 'operator', name: '客服/运营', description: '查看全部数据，编辑内部备注。' },
]

// 角色-权限矩阵（owner 拥有全部，其他按业务开放）
export const ROLE_PERMISSIONS: Record<UserRole, readonly PermissionCode[]> = {
  owner: PERMISSION_CATALOG.map((permission) => permission.code),
  selector: [
    'employee_work.read',
    'employee_work.import',
    'pricing.read',
    'pricing.import',
    'product.read',
    'product.import',
    'product.note.edit',
  ],
  operator: [
    'employee_work.read',
    'pricing.read',
    'product.read',
    'product.note.edit',
  ],
}

export const ALL_ROLE_CODES: readonly UserRole[] = ['owner', 'selector', 'operator']
