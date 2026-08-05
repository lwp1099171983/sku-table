import type {
  AppUser,
  AuthUser,
  EmployeeWorkBatch,
  EmployeeWorkItem,
  ImportBatch,
  PageResult,
  PermissionCode,
  Product,
  ProductPricing,
  PricingBatch,
  Studio,
  UserRole,
} from './type.js'

export interface AuthContextDto {
  user: AuthUser
  studios: Studio[]
  currentStudio: Studio
  roles: UserRole[]
  permissions: PermissionCode[]
}

export interface LoginRequestDto {
  email: string
  password: string
}

export interface LoginResponseDto extends AuthContextDto {
  accessToken: string
  expiresAt: string
}

export interface MeResponseDto extends AuthContextDto {}

export interface RegisterAdminRequestDto {
  email: string
  password: string
  displayName?: string
}

export interface RegisterAdminResponseDto {
  user: AuthUser
}

export interface CreateStudioRequestDto {
  name: string
}

export interface CreateStudioResponseDto {
  studio: Studio
}

export interface StudioMemberDto {
  user: AuthUser
  roles: UserRole[]
  isActive: boolean
  createdAt: string
}

export interface StudioMemberListResponseDto {
  items: StudioMemberDto[]
}

export interface AddStudioMemberRequestDto {
  email: string
  displayName?: string
  password?: string
  roles?: UserRole[]
}

export interface UpdateStudioMemberRequestDto {
  roles?: UserRole[]
  isActive?: boolean
}

export interface ActiveUserListResponseDto {
  items: AppUser[]
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
  sku?: string
}

export type EmployeeWorkListResponseDto = PageResult<EmployeeWorkItem>

export interface EmployeeWorkImportResponseDto {
  batch: EmployeeWorkBatch
  importedRows: number
}

export interface PricingListQueryDto {
  page?: number
  pageSize?: number
  store?: string
  keyword?: string
}

export type PricingListResponseDto = PageResult<ProductPricing>

export interface PricingImportResponseDto {
  batch: PricingBatch
  importedRows: number
}
