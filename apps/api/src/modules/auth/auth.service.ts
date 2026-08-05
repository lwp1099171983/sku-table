import bcrypt from 'bcryptjs'
import type { LoginResponseDto } from '@sku-table/shared'
import { env } from '../../config/env.js'
import { createAdminUser, findActiveUserById, findUserByEmail } from './auth.repository.js'
import { createAccessToken } from './token.js'

export type PublicAuthUser = LoginResponseDto['user']

export class AccountExistsError extends Error {
  constructor() {
    super('该邮箱已注册。')
  }
}

export function toPublicAuthUser(user: {
  id: string
  email: string
  displayName: string | null
  role: PublicAuthUser['role']
}): PublicAuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  }
}

export async function authenticate(email: string, password: string) {
  const user = await findUserByEmail(email)
  const isValid = user?.isActive ? await bcrypt.compare(password, user.passwordHash) : false

  if (!user || !user.isActive || !isValid) {
    return null
  }

  const accessToken = await createAccessToken(user)
  return {
    accessToken,
    expiresAt: new Date(Date.now() + env.JWT_EXPIRES_IN_SECONDS * 1000).toISOString(),
    user: toPublicAuthUser(user),
  }
}

export async function getActivePublicUser(id: string) {
  const user = await findActiveUserById(id)
  return user ? toPublicAuthUser(user) : null
}

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
    const user = await createAdminUser({
      email: input.email,
      passwordHash,
      displayName: input.displayName || null,
    })
    return toPublicAuthUser(user)
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AccountExistsError()
    }
    throw error
  }
}
