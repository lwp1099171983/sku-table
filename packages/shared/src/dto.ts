import type {
  AppUser,
  AuthUser,
  EmployeeWorkBatch,
  EmployeeWorkItem,
  LedgerBatch,
  LedgerItem,
  LedgerStats,
  PageResult,
  PermissionCode,
  Shop,
  UserRole,
} from './type.js'

// currentShop 为 null 表示管理员"全部"视图
export interface AuthContextDto {
  user: AuthUser
  shops: Shop[]
  currentShop: Shop | null
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

export interface SwitchShopRequestDto {
  shopId: string | null
}

export interface RegisterAdminRequestDto {
  email: string
  password: string
  displayName?: string
}

export interface RegisterAdminResponseDto {
  user: AuthUser
}

export interface CreateShopRequestDto {
  name: string
}

export interface CreateShopResponseDto {
  shop: Shop
}

export interface ShopMemberDirectPermissionDto {
  permissionCode: PermissionCode
  effect: 'allow' | 'deny'
}

export interface ShopMemberDto {
  user: AuthUser
  roles: UserRole[]
  directPermissions: ShopMemberDirectPermissionDto[]
  isActive: boolean
  createdAt: string
}

export interface ShopMemberListResponseDto {
  items: ShopMemberDto[]
}

export interface AddShopMemberRequestDto {
  email: string
  displayName?: string
  password?: string
  roles?: UserRole[]
}

export interface UpdateShopMemberRequestDto {
  roles?: UserRole[]
  isActive?: boolean
}

export interface SetShopMemberPermissionRequestDto {
  permissionCode: 'employee_work.delete' | 'ledger.delete'
  effect: 'allow' | 'deny' | null
}

export interface ActiveUserListResponseDto {
  items: AppUser[]
}

export interface ApiErrorDto {
  code: string
  message: string
  details?: unknown
}

export interface EmployeeWorkListQueryDto {
  page?: number
  pageSize?: number
  shopId?: string
  employeeName?: string
  workDate?: string
  sku?: string
}

export type EmployeeWorkListResponseDto = PageResult<EmployeeWorkItem>

export interface EmployeeWorkImportResponseDto {
  batch: EmployeeWorkBatch
  importedRows: number
}

export interface LedgerListQueryDto {
  page?: number
  pageSize?: number
  shopId?: string
  month?: string
  keyword?: string
}

export interface LedgerListResponseDto extends PageResult<LedgerItem> {
  stats: LedgerStats
}

export interface LedgerImportResponseDto {
  batches: LedgerBatch[]
  importedRows: number
}
