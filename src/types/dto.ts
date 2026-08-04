import type { ImportBatch, PageResult, Product, UserRole } from './type'

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
