import bcrypt from 'bcryptjs'
import type { AuthContextDto, LoginResponseDto } from '@sku-table/shared'
import { env } from '../../config/env.js'
import { addUserToStudioWithRoles } from '../studios/studio.repository.js'
import {
  createUser,
  findActiveUserById,
  findUserByEmail,
  getEffectivePermissions,
  getMemberRoles,
  listUserStudios,
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

// 加载用户当前默认工作室（第一个可访问工作室）的完整认证上下文
export async function loadAuthContext(userId: string): Promise<AuthContextDto | null> {
  return loadAuthContextForStudio(userId)
}

// 加载指定工作室的认证上下文；不是成员或无工作室时返回 null
export async function loadAuthContextForStudio(userId: string, studioId?: string): Promise<AuthContextDto | null> {
  const user = await findActiveUserById(userId)
  if (!user) {
    return null
  }

  const studios = await listUserStudios(userId)
  if (studios.length === 0) {
    return null
  }

  const currentStudio = studioId ? studios.find((studio) => studio.id === studioId) : studios[0]
  if (!currentStudio) {
    return null
  }

  const roles = await getMemberRoles(currentStudio.id, userId)
  const permissions = await getEffectivePermissions(currentStudio.id, userId)
  return {
    user: toPublicAuthUser(user),
    studios,
    currentStudio,
    roles,
    permissions,
  }
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

// 注册新管理员：创建账号并加入当前工作室的 owner 角色
export async function registerAdmin(input: {
  email: string
  password: string
  displayName?: string
  studioId: string
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
    })
    await addUserToStudioWithRoles(input.studioId, user.id, ['owner'])
    return toPublicAuthUser(user)
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AccountExistsError()
    }
    throw error
  }
}
