import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { ShopMemberDto, UserRole } from '@sku-table/shared'
import { type AuthEnv, requireAuth, requirePermission, requireShopPermission } from '../modules/auth/auth.middleware.js'
import { BCRYPT_ROUNDS } from '../modules/auth/constants.js'
import { findUserByEmail } from '../modules/auth/auth.repository.js'
import { readBody } from './helpers.js'
import { MEMBER_ASSIGNABLE_PERMISSIONS } from '../modules/auth/rbac.js'
import {
  createShopMember,
  createShop,
  deleteShop,
  getMemberDirectPermissions,
  isShopMember,
  isValidMemberRoleCode,
  listShopMembers,
  removeShopMember,
  setShopMemberActive,
  setShopMemberPermission,
  setShopMemberRoles,
  ShopMemberError,
  ShopNameConflictError,
} from '../modules/shops/shop.repository.js'
import type { ShopMemberRecord } from '../modules/shops/shop.repository.js'

const createShopSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

// 成员可分配的角色码（leader/customer；admin 通过注册管理员页创建）
const roleCodeListSchema = z.array(z.string().trim().min(1)).min(1).refine(
  (roles): roles is Array<'leader' | 'customer'> => roles.every(isValidMemberRoleCode),
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

const setPermissionSchema = z.object({
  permissionCode: z.enum(['employee_work.delete', 'ledger.delete']),
  effect: z.enum(['allow', 'deny']).nullable(),
})

function toMemberDto(member: ShopMemberRecord, directPermissions: Awaited<ReturnType<typeof getMemberDirectPermissions>>): ShopMemberDto {
  return {
    user: { id: member.id, email: member.email, displayName: member.displayName },
    roles: member.roles,
    directPermissions,
    isActive: member.isActive,
    createdAt: member.createdAt,
  }
}

export const shopRoutes = new Hono<AuthEnv>()

// 当前用户可访问的店铺列表
shopRoutes.get('/', requireAuth, (context) => {
  return context.json({ items: context.get('authContext').shops })
})

// 创建店铺（管理员）
shopRoutes.post('/', requireAuth, requirePermission('shop.manage'), async (context) => {
  const body = await readBody(context, createShopSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '店铺名称不能为空，且长度不能超过 100 个字符。' }, 400)
  }

  try {
    const shop = await createShop(body.name)
    return context.json({ shop }, 201)
  } catch (error) {
    if (error instanceof ShopNameConflictError) {
      return context.json({ code: 'SHOP_EXISTS', message: error.message }, 409)
    }
    throw error
  }
})

// 删除店铺（管理员；级联删除成员、员工、工作记录与台账）
shopRoutes.delete('/:shopId', requireAuth, requirePermission('shop.manage'), async (context) => {
  const shopId = context.req.param('shopId')

  const deleted = await deleteShop(shopId)
  if (!deleted) {
    return context.json({ code: 'SHOP_NOT_FOUND', message: '店铺不存在。' }, 404)
  }
  return context.body(null, 204)
})

// 查看店铺成员列表
shopRoutes.get('/:shopId/members', requireShopPermission('member.read'), async (context) => {
  const shopId = context.req.param('shopId')
  const members = await listShopMembers(shopId)
  const items: ShopMemberDto[] = await Promise.all(members.map(async (member) => (
    toMemberDto(member, await getMemberDirectPermissions(shopId, member.id))
  )))
  return context.json({ items })
})

// 添加成员：已有用户直接加入；新用户需设置密码后创建并加入（角色限组长/客服）
shopRoutes.post('/:shopId/members', requireShopPermission('member.manage'), async (context) => {
  const shopId = context.req.param('shopId')
  const body = await readBody(context, addMemberSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请填写有效邮箱，新用户密码至少需要 8 个字符。' }, 400)
  }

  const roles: UserRole[] = [...new Set<UserRole>(body.roles ?? ['customer'])]
  // 新用户必须设置密码；已存在用户（含并发下刚注册的）复用账号，不需要密码
  if (!body.password && !(await findUserByEmail(body.email))) {
    return context.json({ code: 'VALIDATION_ERROR', message: '新用户必须设置密码，且密码至少需要 8 个字符。' }, 400)
  }
  const passwordHash = body.password ? await bcrypt.hash(body.password, BCRYPT_ROUNDS) : null

  let userId: string
  try {
    const result = await createShopMember({
      shopId,
      email: body.email,
      passwordHash,
      displayName: body.displayName ?? null,
      roleCodes: roles,
    })
    userId = result.userId
  } catch (error) {
    if (error instanceof ShopMemberError) {
      const status = error.code === 'MEMBER_EXISTS' ? 409 : 404
      return context.json({ code: error.code, message: error.message }, status)
    }
    throw error
  }

  const member = (await listShopMembers(shopId)).find((item) => item.id === userId)
  if (!member) {
    return context.json({ code: 'MEMBER_NOT_FOUND', message: '成员添加失败。' }, 500)
  }
  return context.json({ member: toMemberDto(member, await getMemberDirectPermissions(shopId, userId)) }, 201)
})

// 修改成员角色或启用状态
shopRoutes.patch('/:shopId/members/:userId', requireShopPermission('member.manage'), async (context) => {
  const shopId = context.req.param('shopId')
  const userId = context.req.param('userId')
  const body = await readBody(context, updateMemberSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请求参数不正确。' }, 400)
  }
  if (body.roles === undefined && body.isActive === undefined) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请至少提供一个要修改的字段。' }, 400)
  }

  if (body.roles !== undefined) {
    await setShopMemberRoles(shopId, userId, body.roles)
  }
  if (body.isActive !== undefined) {
    await setShopMemberActive(shopId, userId, body.isActive)
  }

  const member = (await listShopMembers(shopId)).find((item) => item.id === userId)
  if (!member) {
    return context.json({ code: 'MEMBER_NOT_FOUND', message: '该用户不是此店铺成员。' }, 404)
  }
  return context.json({ member: toMemberDto(member, await getMemberDirectPermissions(shopId, userId)) })
})

// 设置成员用户级直接权限（删除类权限 allow/deny/关闭）
shopRoutes.put('/:shopId/members/:userId/permissions', requireShopPermission('member.manage'), async (context) => {
  const shopId = context.req.param('shopId')
  const userId = context.req.param('userId')
  const body = await readBody(context, setPermissionSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '权限配置不正确，仅支持 employee_work.delete 与 ledger.delete。' }, 400)
  }

  if (!(await isShopMember(shopId, userId))) {
    return context.json({ code: 'MEMBER_NOT_FOUND', message: '该用户不是此店铺成员。' }, 404)
  }

  if (!(MEMBER_ASSIGNABLE_PERMISSIONS as readonly string[]).includes(body.permissionCode)) {
    return context.json({ code: 'VALIDATION_ERROR', message: '该权限码不允许通过成员管理配置。' }, 400)
  }

  await setShopMemberPermission({
    shopId,
    userId,
    permissionCode: body.permissionCode,
    effect: body.effect,
    grantedBy: context.get('authUser').id,
  })

  const member = (await listShopMembers(shopId)).find((item) => item.id === userId)
  if (!member) {
    return context.json({ code: 'MEMBER_NOT_FOUND', message: '该用户不是此店铺成员。' }, 404)
  }
  return context.json({ member: toMemberDto(member, await getMemberDirectPermissions(shopId, userId)) })
})

// 移除成员
shopRoutes.delete('/:shopId/members/:userId', requireShopPermission('member.manage'), async (context) => {
  const shopId = context.req.param('shopId')
  const userId = context.req.param('userId')

  await removeShopMember(shopId, userId)
  return context.body(null, 204)
})
