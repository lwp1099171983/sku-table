import { and, asc, eq } from 'drizzle-orm'
import type { PermissionCode, Studio, UserRole } from '@sku-table/shared'
import { db } from '../../db/client.js'
import {
  appUsers,
  permissions,
  rolePermissions,
  studioMemberPermissions,
  studioMemberRoles,
  studioMembers,
  studios,
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
}) {
  const [user] = await db.insert(appUsers).values({
    email: input.email,
    passwordHash: input.passwordHash,
    displayName: input.displayName,
    isActive: true,
  }).returning()
  return user
}

// 当前用户可访问的工作室（按加入时间排序，第一个作为默认工作室）
export async function listUserStudios(userId: string): Promise<Studio[]> {
  const rows = await db.select({
    id: studios.id,
    name: studios.name,
    createdAt: studios.createdAt,
  })
    .from(studioMembers)
    .innerJoin(studios, eq(studios.id, studioMembers.studioId))
    .where(and(eq(studioMembers.userId, userId), eq(studioMembers.isActive, true)))
    .orderBy(asc(studioMembers.createdAt))

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

// 用户在指定工作室内的角色列表（可多角色）
export async function getMemberRoles(studioId: string, userId: string): Promise<UserRole[]> {
  const rows = await db.select({ roleCode: studioMemberRoles.roleCode })
    .from(studioMemberRoles)
    .where(and(eq(studioMemberRoles.studioId, studioId), eq(studioMemberRoles.userId, userId)))
  return rows.map((row) => row.roleCode)
}

// 计算指定工作室内的有效权限：角色 allow + 用户级 allow - 用户级 deny
export async function getEffectivePermissions(studioId: string, userId: string): Promise<PermissionCode[]> {
  const memberRoles = await getMemberRoles(studioId, userId)

  // owner 拥有全部权限
  if (memberRoles.includes('owner')) {
    const all = await db.select({ code: permissions.code }).from(permissions)
    return all.map((row) => row.code)
  }

  const allows = new Set<PermissionCode>()
  if (memberRoles.length > 0) {
    const roleRows = await db.select({ permissionCode: rolePermissions.permissionCode })
      .from(rolePermissions)
      .innerJoin(studioMemberRoles, and(
        eq(studioMemberRoles.roleCode, rolePermissions.roleCode),
        eq(studioMemberRoles.studioId, studioId),
        eq(studioMemberRoles.userId, userId),
      ))
    for (const row of roleRows) {
      allows.add(row.permissionCode)
    }
  }

  const directRows = await db.select({
    permissionCode: studioMemberPermissions.permissionCode,
    effect: studioMemberPermissions.effect,
  })
    .from(studioMemberPermissions)
    .where(and(eq(studioMemberPermissions.studioId, studioId), eq(studioMemberPermissions.userId, userId)))
  for (const row of directRows) {
    if (row.effect === 'deny') {
      allows.delete(row.permissionCode)
    } else {
      allows.add(row.permissionCode)
    }
  }

  return [...allows]
}
