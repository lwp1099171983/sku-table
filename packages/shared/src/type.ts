// 用户角色：admin 为全局管理员；leader（组长）与 customer（客服）按店铺绑定
export type UserRole = 'admin' | 'leader' | 'customer'

// 权限码最终集：delete 权限不预置给任何角色，靠用户级 allow/deny 开通
export type PermissionCode =
  | 'shop.manage'
  | 'member.read'
  | 'member.manage'
  | 'employee_work.read'
  | 'employee_work.import'
  | 'employee_work.delete'
  | 'employee_work.rollback'
  | 'ledger.read'
  | 'ledger.import'
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

// 员工工作批次
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
  createdAt: string
}

// 员工工作明细（列表项含店铺信息，便于管理员"全部"视图展示店铺列）
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

// 台账明细：25 个字段（含跟踪号），导入保存原始值，公式列不重算
export interface LedgerItem {
  id: number
  batchId: string
  shopId: string
  shopName: string
  seq: string | null
  month: string | null
  orderDate: string | null
  orderNo: string | null
  trackingNo: string | null
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
  compensation: string | null
  remark: string | null
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
