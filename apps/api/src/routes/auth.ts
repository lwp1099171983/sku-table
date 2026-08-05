import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { authenticate } from '../modules/auth/auth.service.js'
import { type AuthEnv, requireAuth } from '../modules/auth/auth.middleware.js'

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
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

loginRoutes.post('/logout', (context) => context.body(null, 204))
