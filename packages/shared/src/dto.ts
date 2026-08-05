import type { EmployeeWorkBatch, EmployeeWorkItem, ImportBatch, OzonProductPricing, OzonStatisticsBatch, PageResult, Product, UserRole } from './type.js'

export interface LoginRequestDto {
  email: string
  password: string
}

export interface LoginResponseDto {
  accessToken: string
  expiresAt: string
  user: {
    id: string
    email: string
    displayName: string | null
    role: UserRole
  }
}

export interface MeResponseDto {
  user: LoginResponseDto['user']
}

export interface ProductListQueryDto {
  page?: number
  pageSize?: number
  createdBy?: string
}

export type ProductListResponseDto = PageResult<Product>

export interface UpdateInternalNoteRequestDto {
  internalNote: string
}

export interface ImportBatchResponseDto {
  batch: ImportBatch
}

export interface ImportProgressDto {
  batchId: string
  status: ImportBatch['status']
  totalRows: number
  processedRows: number
  successRows: number
  failedRows: number
}

export interface ApiErrorDto {
  code: string
  message: string
  details?: unknown
}

export interface EmployeeWorkListQueryDto {
  page?: number
  pageSize?: number
  employeeName?: string
  workDate?: string
}

export type EmployeeWorkListResponseDto = PageResult<EmployeeWorkItem>

export interface EmployeeWorkImportResponseDto {
  batch: EmployeeWorkBatch
  importedRows: number
}

export interface OzonPricingListQueryDto {
  page?: number
  pageSize?: number
  store?: string
  keyword?: string
}

export type OzonPricingListResponseDto = PageResult<OzonProductPricing>

export interface OzonPricingImportResponseDto {
  batch: OzonStatisticsBatch
  importedRows: number
}
