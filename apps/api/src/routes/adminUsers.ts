import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthEnv } from '../modules/auth/auth.middleware.js'
import { BCRYPT_ROUNDS } from '../modules/auth/constants.js'
import { findUserById, listAllNonAdminUsers, updateUserActive, updateUserPassword } from '../modules/auth/auth.repository.js'
import { readBody } from './helpers.js'

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8),
})

const setActiveSchema = z.object({
  isActive: z.boolean(),
})

export const adminUserRoutes = new Hono<AuthEnv>()

adminUserRoutes.use('*', requireAuth)

// 账号列表：全部非管理员账号及其店铺归属（账号管理页视图）
adminUserRoutes.get('/', requirePermission('user.manage'), async (context) => {
  const items = await listAllNonAdminUsers()
  return context.json({ items })
})

// 重置密码：管理员输入新密码；目标必须是非管理员账号，且不能是自己
adminUserRoutes.post('/:userId/reset-password', requirePermission('user.manage'), async (context) => {
  const userId = context.req.param('userId')
  const body = await readBody(context, resetPasswordSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '新密码至少需要 8 个字符。' }, 400)
  }
  if (userId === context.get('authUser').id) {
    return context.json({ code: 'FORBIDDEN', message: '不能重置自己的密码，请使用“修改密码”。' }, 403)
  }

  const target = await findUserById(userId)
  if (!target) {
    return context.json({ code: 'USER_NOT_FOUND', message: '账号不存在。' }, 404)
  }
  if (target.isAdmin) {
    return context.json({ code: 'FORBIDDEN', message: '管理员账号不允许被重置密码。' }, 403)
  }

  const passwordHash = await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS)
  await updateUserPassword(userId, passwordHash)
  return context.body(null, 204)
})

// 停用/启用账号：停用后该账号所有店铺访问立即失效，成员关系保留，重新启用即恢复
adminUserRoutes.patch('/:userId/status', requirePermission('user.manage'), async (context) => {
  const userId = context.req.param('userId')
  const body = await readBody(context, setActiveSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请传入有效的启用状态。' }, 400)
  }
  if (userId === context.get('authUser').id) {
    return context.json({ code: 'FORBIDDEN', message: '不能停用/启用自己的账号。' }, 403)
  }

  const target = await findUserById(userId)
  if (!target) {
    return context.json({ code: 'USER_NOT_FOUND', message: '账号不存在。' }, 404)
  }
  if (target.isAdmin) {
    return context.json({ code: 'FORBIDDEN', message: '管理员账号不允许被停用/启用。' }, 403)
  }

  await updateUserActive(userId, body.isActive)
  return context.body(null, 204)
})
