import { Hono } from 'hono'
import { z } from 'zod'
import { AccountExistsError, authenticate, changePassword, registerAdmin, switchCurrentShop } from '../modules/auth/auth.service.js'
import { type AuthEnv, requireAuth } from '../modules/auth/auth.middleware.js'
import { readBody } from './helpers.js'

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

const registerAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(1).optional(),
})

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

const switchShopSchema = z.object({
  shopId: z.string().trim().min(1).nullable(),
})

export const loginRoutes = new Hono<AuthEnv>()

loginRoutes.post('/login', async (context) => {
  const body = await readBody(context, loginSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '邮箱或密码格式不正确。' }, 400)
  }

  const result = await authenticate(body.email, body.password)
  if (!result) {
    return context.json({ code: 'INVALID_CREDENTIALS', message: '邮箱或密码错误。' }, 401)
  }

  return context.json(result)
})

loginRoutes.get('/me', requireAuth, (context) => context.json(context.get('authContext')))

// 修改密码：验证旧密码后更新，改密后旧 token 不强制下线（v1 无 token_version）
loginRoutes.post('/change-password', requireAuth, async (context) => {
  const body = await readBody(context, changePasswordSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请填写旧密码，新密码至少需要 8 个字符。' }, 400)
  }

  const ok = await changePassword(context.get('authUser').id, body.oldPassword, body.newPassword)
  if (!ok) {
    return context.json({ code: 'INVALID_CREDENTIALS', message: '旧密码不正确。' }, 401)
  }
  return context.body(null, 204)
})

// 切换当前店铺：传 null 表示当前账号可访问的"全部店铺"
loginRoutes.post('/switch-shop', requireAuth, async (context) => {
  const body = await readBody(context, switchShopSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请求参数不正确。' }, 400)
  }

  const result = await switchCurrentShop(context.get('authUser').id, body.shopId)
  if (!result) {
    return context.json({ code: 'FORBIDDEN', message: '无权访问该店铺。' }, 403)
  }
  return context.json(result)
})

// 注册新管理员（全局账号，由现有管理员操作）
loginRoutes.post('/register', requireAuth, async (context) => {
  const body = await readBody(context, registerAdminSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请填写有效邮箱，密码至少需要 8 个字符。' }, 400)
  }

  if (!context.get('authContext').roles.includes('admin')) {
    return context.json({ code: 'FORBIDDEN', message: '只有管理员可以注册新管理员。' }, 403)
  }

  try {
    const user = await registerAdmin(body)
    return context.json({ user }, 201)
  } catch (error) {
    if (error instanceof AccountExistsError) {
      return context.json({ code: 'ACCOUNT_EXISTS', message: error.message }, 409)
    }
    throw error
  }
})

loginRoutes.post('/logout', (context) => context.body(null, 204))
