import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import type { StudioMemberDto, UserRole } from '@sku-table/shared'
import { type AuthEnv, requireAuth, requirePermission, requireStudioPermission } from '../modules/auth/auth.middleware.js'
import { createUser, findUserByEmail } from '../modules/auth/auth.repository.js'
import {
  addUserToStudioWithRoles,
  countOwners,
  createStudio,
  isStudioMember,
  isValidRoleCode,
  listStudioMembers,
  removeStudioMember,
  setStudioMemberActive,
  setStudioMemberRoles,
} from '../modules/studios/studio.repository.js'

const createStudioSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

// 角色码列表：每个元素必须是有效角色码，type guard 让推断结果为 UserRole[]
const roleCodeListSchema = z.array(z.string().trim().min(1)).min(1).refine(
  (roles): roles is UserRole[] => roles.every(isValidRoleCode),
  '存在无效的角色',
)

const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1).optional(),
  password: z.string().min(8).optional(),
  roles: roleCodeListSchema.optional(),
})

const updateMemberSchema = z.object({
  roles: roleCodeListSchema.optional(),
  isActive: z.boolean().optional(),
})

async function readCreateStudioBody(context: Context<AuthEnv>) {
  try {
    const body = await context.req.json()
    const result = createStudioSchema.safeParse(body)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

async function readAddMemberBody(context: Context<AuthEnv>) {
  try {
    const body = await context.req.json()
    const result = addMemberSchema.safeParse(body)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

async function readUpdateMemberBody(context: Context<AuthEnv>) {
  try {
    const body = await context.req.json()
    const result = updateMemberSchema.safeParse(body)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export const studioRoutes = new Hono<AuthEnv>()

// 当前用户可访问的工作室列表
studioRoutes.get('/', requireAuth, (context) => {
  return context.json({ items: context.get('authContext').studios })
})

// 创建工作室（创建者自动成为 owner）
studioRoutes.post('/', requireAuth, requirePermission('studio.manage'), async (context) => {
  const body = await readCreateStudioBody(context)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '工作室名称不能为空，且长度不能超过 100 个字符。' }, 400)
  }

  const studio = await createStudio(body.name, context.get('authUser').id)
  return context.json({ studio }, 201)
})

// 查看工作室成员列表
studioRoutes.get('/:studioId/members', requireStudioPermission('member.read'), async (context) => {
  const studioId = context.req.param('studioId')
  const members = await listStudioMembers(studioId)
  const items: StudioMemberDto[] = members.map((member) => ({
    user: { id: member.id, email: member.email, displayName: member.displayName },
    roles: member.roles,
    isActive: member.isActive,
    createdAt: member.createdAt,
  }))
  return context.json({ items })
})

// 添加成员：已有用户直接加入；新用户需设置密码后创建并加入
studioRoutes.post('/:studioId/members', requireStudioPermission('member.manage'), async (context) => {
  const studioId = context.req.param('studioId')
  const body = await readAddMemberBody(context)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请填写有效邮箱，新用户密码至少需要 8 个字符。' }, 400)
  }

  const roles = [...new Set<UserRole>(body.roles ?? ['operator'])]
  const existing = await findUserByEmail(body.email)
  let userId: string

  if (existing) {
    if (await isStudioMember(studioId, existing.id)) {
      return context.json({ code: 'MEMBER_EXISTS', message: '该用户已经是此工作室成员。' }, 409)
    }
    userId = existing.id
  } else {
    if (!body.password) {
      return context.json({ code: 'VALIDATION_ERROR', message: '新用户必须设置密码，且密码至少需要 8 个字符。' }, 400)
    }
    const passwordHash = await bcrypt.hash(body.password, 12)
    const created = await createUser({
      email: body.email,
      passwordHash,
      displayName: body.displayName ?? null,
    })
    userId = created.id
  }

  await addUserToStudioWithRoles(studioId, userId, roles)
  const member = (await listStudioMembers(studioId)).find((item) => item.id === userId)
  return context.json({ member }, 201)
})

// 修改成员角色或启用状态（不能移除/停用最后一个 owner）
studioRoutes.patch('/:studioId/members/:userId', requireStudioPermission('member.manage'), async (context) => {
  const studioId = context.req.param('studioId')
  const userId = context.req.param('userId')
  const body = await readUpdateMemberBody(context)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请求参数不正确。' }, 400)
  }
  if (body.roles === undefined && body.isActive === undefined) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请至少提供一个要修改的字段。' }, 400)
  }

  const removingOwnerRole = body.roles !== undefined && !body.roles.includes('owner')
  const deactivating = body.isActive === false
  if ((removingOwnerRole || deactivating) && (await countOwners(studioId, userId)) === 0) {
    return context.json({ code: 'LAST_OWNER', message: '工作室必须保留至少一个负责人。' }, 400)
  }

  if (body.roles !== undefined) {
    await setStudioMemberRoles(studioId, userId, body.roles)
  }
  if (body.isActive !== undefined) {
    await setStudioMemberActive(studioId, userId, body.isActive)
  }

  const member = (await listStudioMembers(studioId)).find((item) => item.id === userId)
  if (!member) {
    return context.json({ code: 'MEMBER_NOT_FOUND', message: '该用户不是此工作室成员。' }, 404)
  }
  return context.json({ member })
})

// 移除成员（不能移除最后一个 owner）
studioRoutes.delete('/:studioId/members/:userId', requireStudioPermission('member.manage'), async (context) => {
  const studioId = context.req.param('studioId')
  const userId = context.req.param('userId')
  if ((await countOwners(studioId, userId)) === 0) {
    return context.json({ code: 'LAST_OWNER', message: '工作室必须保留至少一个负责人。' }, 400)
  }

  await removeStudioMember(studioId, userId)
  return context.body(null, 204)
})
