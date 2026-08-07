import { and, asc, eq } from 'drizzle-orm'
import type { PermissionCode, Shop, UserRole } from '@sku-table/shared'
import { db } from '../../db/client.js'
import {
  appUsers,
  permissions,
  rolePermissions,
  shopMemberPermissions,
  shopMemberRoles,
  shopMembers,
  shops,
} from '../../db/schema.js'

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1)
  return user ?? null
}

export async function findActiveUserById(id: string) {
  const [user] = await db.select().from(appUsers).where(eq(appUsers.id, id)).limit(1)
  return user?.isActive ? user : null
}

export async function createUser(input: {
  email: string
  passwordHash: string
  displayName: string | null
  isAdmin?: boolean
}) {
  const [user] = await db.insert(appUsers).values({
    email: input.email,
    passwordHash: input.passwordHash,
    displayName: input.displayName,
    isAdmin: input.isAdmin ?? false,
    isActive: true,
  }).returning()
  return user
}

// 全部店铺（管理员视角）
export async function listAllShops(): Promise<Shop[]> {
  const rows = await db.select({
    id: shops.id,
    name: shops.name,
    createdAt: shops.createdAt,
  })
    .from(shops)
    .orderBy(asc(shops.createdAt))

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

// 当前用户可访问的店铺（按加入时间排序，第一个作为默认店铺）
export async function listUserShops(userId: string): Promise<Shop[]> {
  const rows = await db.select({
    id: shops.id,
    name: shops.name,
    createdAt: shops.createdAt,
  })
    .from(shopMembers)
    .innerJoin(shops, eq(shops.id, shopMembers.shopId))
    .where(and(eq(shopMembers.userId, userId), eq(shopMembers.isActive, true)))
    .orderBy(asc(shopMembers.createdAt))

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

export async function findShopById(shopId: string): Promise<Shop | null> {
  const [row] = await db.select({
    id: shops.id,
    name: shops.name,
    createdAt: shops.createdAt,
  })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1)

  return row ? { ...row, createdAt: row.createdAt.toISOString() } : null
}

// 用户在指定店铺内的角色列表（可多角色）
export async function getMemberRoles(shopId: string, userId: string): Promise<UserRole[]> {
  const rows = await db.select({ roleCode: shopMemberRoles.roleCode })
    .from(shopMemberRoles)
    .where(and(eq(shopMemberRoles.shopId, shopId), eq(shopMemberRoles.userId, userId)))
  return rows.map((row) => row.roleCode)
}

// 计算指定店铺内的有效权限：角色 allow + 用户级 allow - 用户级 deny
export async function getEffectivePermissions(shopId: string, userId: string): Promise<PermissionCode[]> {
  const memberRoles = await getMemberRoles(shopId, userId)

  const allows = new Set<PermissionCode>()
  if (memberRoles.length > 0) {
    const roleRows = await db.select({ permissionCode: rolePermissions.permissionCode })
      .from(rolePermissions)
      .innerJoin(shopMemberRoles, and(
        eq(shopMemberRoles.roleCode, rolePermissions.roleCode),
        eq(shopMemberRoles.shopId, shopId),
        eq(shopMemberRoles.userId, userId),
      ))
    for (const row of roleRows) {
      allows.add(row.permissionCode)
    }
  }

  const directRows = await db.select({
    permissionCode: shopMemberPermissions.permissionCode,
    effect: shopMemberPermissions.effect,
  })
    .from(shopMemberPermissions)
    .where(and(eq(shopMemberPermissions.shopId, shopId), eq(shopMemberPermissions.userId, userId)))
  for (const row of directRows) {
    if (row.effect === 'deny') {
      allows.delete(row.permissionCode)
    } else {
      allows.add(row.permissionCode)
    }
  }

  return [...allows]
}

// 全部权限码（管理员使用）
export async function listAllPermissionCodes(): Promise<PermissionCode[]> {
  const rows = await db.select({ code: permissions.code }).from(permissions)
  return rows.map((row) => row.code)
}
