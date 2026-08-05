export type UserRole = 'owner' | 'selector' | 'operator'

export interface AppUser {
  id: string
  email: string
  displayName: string | null
  role: UserRole
  isActive: boolean
  createdAt: string
}

export interface Product {
  id: number
  seq: string | null
  sku: string | null
  platform: string | null
  name: string
  url: string | null
  spec: string | null
  price: string | null
  internalNote: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  batchId: string
  uploader: Pick<AppUser, 'id' | 'email' | 'displayName'> | null
}

export type ImportBatchStatus = 'pending' | 'processing' | 'succeeded' | 'partial_failed' | 'failed'

export interface ImportBatch {
  id: string
  fileName: string
  status: ImportBatchStatus
  totalRows: number
  successRows: number
  failedRows: number
  errorRows: ImportRowError[]
  createdBy: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface ImportRowError {
  rowNumber: number
  message: string
}

export interface EmployeeWorkBatch {
  id: string
  employeeName: string
  employeeId: string | null
  workDate: string
  fileName: string
  uploadedBy: string
  totalRows: number
  createdAt: string
}

export interface EmployeeWorkItem {
  id: number
  batchId: string
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

export interface OzonStatisticsBatch {
  id: string
  fileName: string
  uploadedBy: string
  totalRows: number
  createdAt: string
}

export interface OzonProductPricing {
  id: string
  batchId: string | null
  store: string | null
  productName: string
  supplierSku: string | null
  purchasePrice: string | null
  weightKg: string | null
  localSku: string | null
  nameAbbreviation: string | null
  skuPrefix: string | null
  sellingPrice: string | null
  actualMarginRate: string | null
  breakevenSellingPrice: string | null
  priceCheck: boolean
  weightCheck: boolean
  breakevenProfit: string | null
  breakevenMarginRate: string | null
  price1: string | null
  shippingFee: string | null
  commissionRate: string | null
  returnRate: string | null
  sourceUrl: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}
