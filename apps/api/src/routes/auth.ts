import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { AccountExistsError, authenticate, registerAdmin } from '../modules/auth/auth.service.js'
import { type AuthEnv, requireAuth, requireRole } from '../modules/auth/auth.middleware.js'

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

const registerAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(1).optional(),
})

async function readLoginBody(context: Context<AuthEnv>) {
  try {
    const body = await context.req.json()
    const result = loginSchema.safeParse(body)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

async function readRegisterAdminBody(context: Context<AuthEnv>) {
  try {
    const body = await context.req.json()
    const result = registerAdminSchema.safeParse(body)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export const loginRoutes = new Hono<AuthEnv>()

loginRoutes.post('/login', async (context) => {
  const body = await readLoginBody(context)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '邮箱或密码格式不正确。' }, 400)
  }

  const result = await authenticate(body.email, body.password)
  if (!result) {
    return context.json({ code: 'INVALID_CREDENTIALS', message: '邮箱或密码错误。' }, 401)
  }

  return context.json(result)
})

loginRoutes.get('/me', requireAuth, (context) => context.json({ user: context.get('authUser') }))

loginRoutes.post('/register', requireAuth, requireRole('owner'), async (context) => {
  const body = await readRegisterAdminBody(context)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请填写有效邮箱，密码至少需要 8 个字符。' }, 400)
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
