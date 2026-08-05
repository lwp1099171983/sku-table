import { Hono } from 'hono'
import { z } from 'zod'
import { type AuthEnv, requireAuth, requirePermission } from '../modules/auth/auth.middleware.js'
import { listStudioMembers } from '../modules/studios/studio.repository.js'

const listUsersQuerySchema = z.object({
  activeOnly: z.enum(['true', 'false']).optional(),
})

export const userRoutes = new Hono<AuthEnv>()

// 当前工作室成员列表，支持按启用状态过滤
userRoutes.get('/', requireAuth, requirePermission('member.read'), async (context) => {
  const query = listUsersQuerySchema.safeParse(context.req.query())
  if (!query.success) {
    return context.json({ code: 'VALIDATION_ERROR', message: '查询参数不正确。' }, 400)
  }

  const studioId = context.get('authContext').currentStudio.id
  const members = await listStudioMembers(studioId)
  const items = query.data.activeOnly === 'true' ? members.filter((item) => item.isActive) : members
  return context.json({ items })
})
