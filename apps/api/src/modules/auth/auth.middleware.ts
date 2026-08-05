import type { Context, MiddlewareHandler } from 'hono'
import type { UserRole } from '@sku-table/shared'
import { getActivePublicUser } from './auth.service.js'
import { verifyAccessToken } from './token.js'

export type AuthEnv = {
  Variables: {
    authUser: NonNullable<Awaited<ReturnType<typeof getActivePublicUser>>>
  }
}

function unauthorized(context: Context<AuthEnv>) {
  return context.json({ code: 'UNAUTHORIZED', message: '登录状态无效或已过期。' }, 401)
}

export const requireAuth: MiddlewareHandler<AuthEnv> = async (context, next) => {
  const authorization = context.req.header('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return unauthorized(context)
  }

  try {
    const userId = await verifyAccessToken(authorization.slice(7).trim())
    if (!userId) {
      return unauthorized(context)
    }

    const user = await getActivePublicUser(userId)
    if (!user) {
      return unauthorized(context)
    }

    context.set('authUser', user)
    await next()
  } catch {
    return unauthorized(context)
  }
}

export function requireRole(...roles: UserRole[]): MiddlewareHandler<AuthEnv> {
  return async (context, next) => {
    if (!roles.includes(context.get('authUser').role)) {
      return context.json({ code: 'FORBIDDEN', message: '当前账号没有执行此操作的权限。' }, 403)
    }

    await next()
  }
}
