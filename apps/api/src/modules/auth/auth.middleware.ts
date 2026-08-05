import type { Context, MiddlewareHandler } from 'hono'
import type { AuthContextDto, PermissionCode } from '@sku-table/shared'
import { getActivePublicUser, loadAuthContext, loadAuthContextForStudio } from './auth.service.js'
import { verifyAccessToken } from './token.js'

export type AuthEnv = {
  Variables: {
    authUser: AuthContextDto['user']
    authContext: AuthContextDto
  }
}

function unauthorized(context: Context<AuthEnv>) {
  return context.json({ code: 'UNAUTHORIZED', message: '登录状态无效或已过期。' }, 401)
}

export function forbidden(context: Context<AuthEnv>, message = '当前账号没有执行此操作的权限。') {
  return context.json({ code: 'FORBIDDEN', message }, 403)
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

    const authContext = await loadAuthContext(userId)
    if (!authContext) {
      return unauthorized(context)
    }

    context.set('authUser', authContext.user)
    context.set('authContext', authContext)
    await next()
  } catch {
    return unauthorized(context)
  }
}

// 权限校验：基于服务端计算的当前工作室权限，不接受客户端传入的权限
export function requirePermission(permission: PermissionCode): MiddlewareHandler<AuthEnv> {
  return async (context, next) => {
    if (!context.get('authContext').permissions.includes(permission)) {
      return forbidden(context)
    }
    await next()
  }
}

// 针对 :studioId 路径参数的权限中间件：自校验登录、成员关系与目标工作室权限
export function requireStudioPermission(permission: PermissionCode): MiddlewareHandler<AuthEnv> {
  return async (context, next) => {
    let authUser = context.get('authUser')
    if (!authUser) {
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
        authUser = user
        context.set('authUser', user)
      } catch {
        return unauthorized(context)
      }
    }

    const studioId = context.req.param('studioId')
    const studioContext = await loadAuthContextForStudio(authUser.id, studioId)
    if (!studioContext) {
      return forbidden(context, '您不是该工作室成员。')
    }
    if (!studioContext.permissions.includes(permission)) {
      return forbidden(context)
    }
    context.set('authContext', studioContext)
    await next()
  }
}
