// 用户角色：admin 为全局管理员；leader（组长）与 customer（客服）按店铺绑定
export type UserRole = 'admin' | 'leader' | 'customer'

// 权限码最终集：编辑/删除权限不预置给普通角色，靠用户级 allow/deny 开通
export type PermissionCode =
  | 'shop.manage'
  | 'member.read'
  | 'member.manage'
  | 'user.manage'
  | 'employee_work.read'
  | 'employee_work.import'
  | 'employee_work.delete'
  | 'employee_work.rollback'
  | 'ledger.read'
  | 'ledger.stats.read'
  | 'ledger.import'
  | 'ledger.edit'
  | 'ledger.delete'

export interface AuthUser {
  id: string
  email: string
  displayName: string | null
}

// 店铺（替代原工作室）
export interface Shop {
  id: string
  name: string
  createdAt: string
}

export interface AppUser extends AuthUser {
  isAdmin: boolean
  isActive: boolean
  createdAt: string
}

// 员工工作批次（archivedAt/archivedBy 非空表示已按批次回滚，默认列表不展示）
export interface EmployeeWorkBatch {
  id: string
  shopId: string
  shopName: string
  employeeName: string
  employeeId: string | null
  workDate: string
  fileName: string
  uploadedBy: string
  totalRows: number
  archivedAt: string | null
  archivedBy: string | null
  createdAt: string
}

// 员工工作明细（列表项含店铺信息，便于"全部店铺"视图展示店铺列）
export interface EmployeeWorkItem {
  id: number
  batchId: string
  shopId: string
  shopName: string
  employeeName: string
  workDate: string
  seq: string | null
  sku: string | null
  platform: string | null
  name: string
  url: string | null
  spec: string | null
  price: string | null
}

// 台账批次
export interface LedgerBatch {
  id: string
  shopId: string
  shopName: string
  fileName: string
  uploadedBy: string
  totalRows: number
  createdAt: string
}

// 台账明细：25 个字段（含 SKU），导入保存原始值，在线修改重量时重算公式列。
// deletedAt/deletedBy 非空表示已移入回收站，仅管理员可查看和恢复。
export interface LedgerItem {
  id: number
  batchId: string
  shopId: string
  shopName: string
  seq: string | null
  month: string | null
  orderDate: string | null
  orderNo: string | null
  sku: string | null
  salePrice: string | null
  quantity: string | null
  unitPrice: string | null
  purchaseAmount: string | null
  purchaseDate: string | null
  purchasePlatform: string | null
  purchaseOrderNo: string | null
  grossProfit: string | null
  channelName: string | null
  packageWeight: string | null
  freight: string | null
  commission: string | null
  netProfit: string | null
  ad22: string | null
  ad22Net: string | null
  ad30: string | null
  ad30Net: string | null
  tailFee: string | null
  shippingRateVersionId: string | null
  remark: string | null
  deletedAt: string | null
  deletedBy: string | null
}

// 物流资费版本与规则：管理员维护版本，台账重量重算时锁定实际使用版本。
export interface ShippingRateVersion {
  id: string
  name: string
  sourceFileName: string
  isActive: boolean
  activatedAt: string | null
  createdAt: string
  ruleCount: number
}

export interface ShippingRate {
  id: number
  channelName: string
  basePrice: string
  pricePerGram: string
  minWeight: number
  maxWeight: number
}

// 台账顶部统计（随筛选结果变化），公式见需求文档
export interface LedgerStats {
  purchaseAmount: number
  revenue: number
  grossProfit: number
  freight: number
  commission: number
  netProfit: number
  withdrawalFee: number
  pureProfit: number
}

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}
