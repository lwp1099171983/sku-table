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

// 当前店铺为空时表示管理员「全部」视图
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

export interface ChangePasswordRequestDto {
  oldPassword: string
  newPassword: string
}

export interface ResetPasswordRequestDto {
  newPassword: string
}

export interface SetUserActiveRequestDto {
  isActive: boolean
}

// 账号视图：非管理员用户及其店铺归属（管理员全局账号管理用）
export interface AdminUserMembershipDto {
  shopId: string
  shopName: string
  roles: UserRole[]
  memberActive: boolean
}

export interface AdminUserDto extends AppUser {
  memberships: AdminUserMembershipDto[]
}

export interface AdminUserListResponseDto {
  items: AdminUserDto[]
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
  // 幂等命中：该文件（内容指纹）此前已导入过，未重复入库
  reused: boolean
}

export interface LedgerListQueryDto {
  page?: number
  pageSize?: number
  shopId?: string
  month?: string
  keyword?: string
}

export interface LedgerListResponseDto extends PageResult<LedgerItem> {
  // 统计数据单独受 ledger.stats.read 权限控制，无权限时不返回
  stats?: LedgerStats
}

export interface LedgerImportResponseDto {
  batches: LedgerBatch[]
  importedRows: number
  // 幂等命中：该文件（内容指纹）此前已导入过，未重复入库
  reused: boolean
}
