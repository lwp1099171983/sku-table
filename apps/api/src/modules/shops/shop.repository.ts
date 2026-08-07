import { and, asc, eq } from 'drizzle-orm'
import type { PermissionCode, ShopMemberDirectPermissionDto, UserRole } from '@sku-table/shared'
import { db } from '../../db/client.js'
import { appUsers, shopMemberPermissions, shopMemberRoles, shopMembers, shops } from '../../db/schema.js'
import { MEMBER_ROLE_CODES } from '../auth/rbac.js'

export class ShopMemberError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

// 店铺成员记录（含该店铺内的角色，用于成员管理列表）
export interface ShopMemberRecord {
  id: string
  email: string
  displayName: string | null
  isAdmin: boolean
  roles: UserRole[]
  isActive: boolean
  createdAt: string
}

export function toShopRow(shop: { id: string; name: string; createdAt: Date }) {
  return { id: shop.id, name: shop.name, createdAt: shop.createdAt.toISOString() }
}

// 创建店铺（管理员全局账号，无需绑定成员关系）
export async function createShop(name: string) {
  const [shop] = await db.insert(shops).values({ name }).returning()
  if (!shop) {
    throw new Error('店铺创建失败。')
  }
  return toShopRow(shop)
}

// 把用户加入店铺并授予角色（幂等）
export async function addUserToShopWithRoles(shopId: string, userId: string, roleCodes: UserRole[]) {
  await db.transaction(async (tx) => {
    await tx.insert(shopMembers).values({ shopId, userId, isActive: true }).onConflictDoNothing()
    for (const roleCode of roleCodes) {
      await tx.insert(shopMemberRoles).values({ shopId, userId, roleCode }).onConflictDoNothing()
    }
  })
}

export function isValidMemberRoleCode(value: string): value is UserRole {
  return (MEMBER_ROLE_CODES as readonly string[]).includes(value)
}

// 校验用户是否为店铺成员
export async function isShopMember(shopId: string, userId: string) {
  const [row] = await db.select({ userId: shopMembers.userId })
    .from(shopMembers)
    .where(and(eq(shopMembers.shopId, shopId), eq(shopMembers.userId, userId)))
  return Boolean(row)
}

// 用户在某店铺内的直接权限（allow/deny）
export async function getMemberDirectPermissions(shopId: string, userId: string): Promise<ShopMemberDirectPermissionDto[]> {
  const rows = await db.select({
    permissionCode: shopMemberPermissions.permissionCode,
    effect: shopMemberPermissions.effect,
  })
    .from(shopMemberPermissions)
    .where(and(eq(shopMemberPermissions.shopId, shopId), eq(shopMemberPermissions.userId, userId)))

  return rows.map((row) => ({ permissionCode: row.permissionCode, effect: row.effect }))
}

// 店铺成员列表（含角色与直接权限），按加入时间排序
export async function listShopMembers(shopId: string): Promise<ShopMemberRecord[]> {
  const rows = await db.select({
    id: appUsers.id,
    email: appUsers.email,
    displayName: appUsers.displayName,
    isAdmin: appUsers.isAdmin,
    isActive: shopMembers.isActive,
    createdAt: shopMembers.createdAt,
    roleCode: shopMemberRoles.roleCode,
  })
    .from(shopMembers)
    .innerJoin(appUsers, eq(appUsers.id, shopMembers.userId))
    .leftJoin(shopMemberRoles, and(
      eq(shopMemberRoles.shopId, shopId),
      eq(shopMemberRoles.userId, appUsers.id),
    ))
    .where(eq(shopMembers.shopId, shopId))
    .orderBy(asc(shopMembers.createdAt))

  const byUser = new Map<string, ShopMemberRecord>()
  for (const row of rows) {
    const existing = byUser.get(row.id)
    if (existing) {
      if (row.roleCode) {
        existing.roles.push(row.roleCode)
      }
    } else {
      byUser.set(row.id, {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        isAdmin: row.isAdmin,
        roles: row.roleCode ? [row.roleCode] : [],
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
      })
    }
  }
  return [...byUser.values()]
}

// 替换成员角色列表（先删后加）
export async function setShopMemberRoles(shopId: string, userId: string, roleCodes: UserRole[]) {
  await db.transaction(async (tx) => {
    await tx.delete(shopMemberRoles)
      .where(and(eq(shopMemberRoles.shopId, shopId), eq(shopMemberRoles.userId, userId)))
    for (const roleCode of roleCodes) {
      await tx.insert(shopMemberRoles).values({ shopId, userId, roleCode }).onConflictDoNothing()
    }
  })
}

export async function setShopMemberActive(shopId: string, userId: string, isActive: boolean) {
  await db.update(shopMembers)
    .set({ isActive })
    .where(and(eq(shopMembers.shopId, shopId), eq(shopMembers.userId, userId)))
}

// 移除成员（角色与用户级权限随成员关系级联删除）
export async function removeShopMember(shopId: string, userId: string) {
  await db.delete(shopMembers)
    .where(and(eq(shopMembers.shopId, shopId), eq(shopMembers.userId, userId)))
}

// 设置用户级直接权限：effect 为 null 时移除该条记录
export async function setShopMemberPermission(input: {
  shopId: string
  userId: string
  permissionCode: PermissionCode
  effect: 'allow' | 'deny' | null
  grantedBy: string
}) {
  if (input.effect === null) {
    await db.delete(shopMemberPermissions)
      .where(and(
        eq(shopMemberPermissions.shopId, input.shopId),
        eq(shopMemberPermissions.userId, input.userId),
        eq(shopMemberPermissions.permissionCode, input.permissionCode),
      ))
    return
  }

  await db.insert(shopMemberPermissions).values({
    shopId: input.shopId,
    userId: input.userId,
    permissionCode: input.permissionCode,
    effect: input.effect,
    grantedBy: input.grantedBy,
  }).onConflictDoUpdate({
    target: [shopMemberPermissions.shopId, shopMemberPermissions.userId, shopMemberPermissions.permissionCode],
    set: { effect: input.effect, grantedBy: input.grantedBy },
  })
}
