import bcrypt from 'bcryptjs'
import type { AuthContextDto, LoginResponseDto } from '@sku-table/shared'
import { env } from '../../config/env.js'
import {
  createUser,
  findActiveUserById,
  findShopById,
  findUserByEmail,
  getEffectivePermissions,
  getMemberRoles,
  listAllPermissionCodes,
  listAllShops,
  listUserShops,
} from './auth.repository.js'
import { createAccessToken } from './token.js'

export type PublicAuthUser = AuthContextDto['user']

export class AccountExistsError extends Error {
  constructor() {
    super('该邮箱已注册。')
  }
}

export function toPublicAuthUser(user: {
  id: string
  email: string
  displayName: string | null
}): PublicAuthUser {
  return { id: user.id, email: user.email, displayName: user.displayName }
}

// 管理员：全部店铺 + 全部权限；currentShop 为 null 表示"全部"视图
async function buildAdminContext(user: { id: string; email: string; displayName: string | null }, shopId?: string): Promise<AuthContextDto | null> {
  const shops = await listAllShops()
  let currentShop = null
  if (shopId) {
    const target = await findShopById(shopId)
    if (!target) {
      return null
    }
    currentShop = target
  }
  return {
    user: toPublicAuthUser(user),
    shops,
    currentShop,
    roles: ['admin'],
    permissions: await listAllPermissionCodes(),
  }
}

// 非管理员：按店铺成员关系加载上下文
async function buildMemberContext(user: { id: string; email: string; displayName: string | null }, shopId?: string): Promise<AuthContextDto | null> {
  const shops = await listUserShops(user.id)
  if (shops.length === 0) {
    return null
  }

  const currentShop = shopId ? shops.find((shop) => shop.id === shopId) : shops[0]
  if (!currentShop) {
    return null
  }

  const roles = await getMemberRoles(currentShop.id, user.id)
  const permissions = await getEffectivePermissions(currentShop.id, user.id)
  return {
    user: toPublicAuthUser(user),
    shops,
    currentShop,
    roles,
    permissions,
  }
}

// 加载用户默认认证上下文（管理员默认"全部"；成员默认第一个可访问店铺）
export async function loadAuthContext(userId: string): Promise<AuthContextDto | null> {
  const user = await findActiveUserById(userId)
  if (!user) {
    return null
  }
  const publicUser = { id: user.id, email: user.email, displayName: user.displayName }
  return user.isAdmin
    ? buildAdminContext(publicUser)
    : buildMemberContext(publicUser)
}

// 加载指定店铺的认证上下文（管理员可切任意店铺或"全部"；成员只能切被分配的店铺）
export async function loadAuthContextForShop(userId: string, shopId?: string): Promise<AuthContextDto | null> {
  const user = await findActiveUserById(userId)
  if (!user) {
    return null
  }
  const publicUser = { id: user.id, email: user.email, displayName: user.displayName }
  return user.isAdmin
    ? buildAdminContext(publicUser, shopId)
    : buildMemberContext(publicUser, shopId)
}

// 切换当前店铺：管理员可传 null（全部）；成员只能传自己已分配的店铺
export async function switchCurrentShop(userId: string, shopId: string | null): Promise<AuthContextDto | null> {
  return loadAuthContextForShop(userId, shopId ?? undefined)
}

export async function authenticate(email: string, password: string): Promise<LoginResponseDto | null> {
  const user = await findUserByEmail(email)
  const isValid = user?.isActive ? await bcrypt.compare(password, user.passwordHash) : false

  if (!user || !user.isActive || !isValid) {
    return null
  }

  const context = await loadAuthContext(user.id)
  if (!context) {
    return null
  }

  const accessToken = await createAccessToken(user)
  return {
    ...context,
    accessToken,
    expiresAt: new Date(Date.now() + env.JWT_EXPIRES_IN_SECONDS * 1000).toISOString(),
  }
}

export async function getActivePublicUser(id: string): Promise<PublicAuthUser | null> {
  const user = await findActiveUserById(id)
  return user ? toPublicAuthUser(user) : null
}

// 注册新管理员：全局账号（is_admin = true），不绑定店铺
export async function registerAdmin(input: {
  email: string
  password: string
  displayName?: string
}) {
  if (await findUserByEmail(input.email)) {
    throw new AccountExistsError()
  }

  const passwordHash = await bcrypt.hash(input.password, 12)

  try {
    const user = await createUser({
      email: input.email,
      passwordHash,
      displayName: input.displayName || null,
      isAdmin: true,
    })
    return toPublicAuthUser(user)
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AccountExistsError()
    }
    throw error
  }
}
