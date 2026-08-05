import { and, asc, eq, ne } from 'drizzle-orm'
import type { AppUser, UserRole } from '@sku-table/shared'
import { db } from '../../db/client.js'
import { appUsers, studioMemberRoles, studioMembers, studios } from '../../db/schema.js'
import { ALL_ROLE_CODES } from '../auth/rbac.js'

export class StudioMemberError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export function toStudioRow(studio: { id: string; name: string; createdAt: Date }) {
  return { id: studio.id, name: studio.name, createdAt: studio.createdAt.toISOString() }
}

// 创建工作室并自动把创建者加入为 owner
export async function createStudio(name: string, ownerUserId: string) {
  return db.transaction(async (tx) => {
    const [studio] = await tx.insert(studios).values({ name }).returning()
    if (!studio) {
      throw new Error('工作室创建失败。')
    }
    await tx.insert(studioMembers).values({ studioId: studio.id, userId: ownerUserId, isActive: true }).onConflictDoNothing()
    await tx.insert(studioMemberRoles).values({ studioId: studio.id, userId: ownerUserId, roleCode: 'owner' }).onConflictDoNothing()
    return toStudioRow(studio)
  })
}

// 把用户加入工作室并授予角色（幂等）
export async function addUserToStudioWithRoles(studioId: string, userId: string, roleCodes: UserRole[]) {
  await db.transaction(async (tx) => {
    await tx.insert(studioMembers).values({ studioId, userId, isActive: true }).onConflictDoNothing()
    for (const roleCode of roleCodes) {
      await tx.insert(studioMemberRoles).values({ studioId, userId, roleCode }).onConflictDoNothing()
    }
  })
}

export function isValidRoleCode(value: string): value is UserRole {
  return (ALL_ROLE_CODES as readonly string[]).includes(value)
}

// 校验用户是否为工作室成员
export async function isStudioMember(studioId: string, userId: string) {
  const [row] = await db.select({ userId: studioMembers.userId })
    .from(studioMembers)
    .where(and(eq(studioMembers.studioId, studioId), eq(studioMembers.userId, userId)))
  return Boolean(row)
}

// 工作室成员列表（含角色），按加入时间排序
export async function listStudioMembers(studioId: string): Promise<AppUser[]> {
  const rows = await db.select({
    id: appUsers.id,
    email: appUsers.email,
    displayName: appUsers.displayName,
    isActive: studioMembers.isActive,
    createdAt: studioMembers.createdAt,
    roleCode: studioMemberRoles.roleCode,
  })
    .from(studioMembers)
    .innerJoin(appUsers, eq(appUsers.id, studioMembers.userId))
    .leftJoin(studioMemberRoles, and(
      eq(studioMemberRoles.studioId, studioId),
      eq(studioMemberRoles.userId, appUsers.id),
    ))
    .where(eq(studioMembers.studioId, studioId))
    .orderBy(asc(studioMembers.createdAt))

  const byUser = new Map<string, AppUser>()
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
        roles: row.roleCode ? [row.roleCode] : [],
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
      })
    }
  }
  return [...byUser.values()]
}

// 统计工作室 owner 数量（可排除指定用户，用于最后一个 owner 保护）
export async function countOwners(studioId: string, excludeUserId?: string) {
  const conditions = [
    eq(studioMemberRoles.studioId, studioId),
    eq(studioMemberRoles.roleCode, 'owner'),
  ]
  if (excludeUserId) {
    conditions.push(ne(studioMemberRoles.userId, excludeUserId))
  }
  const rows = await db.select({ userId: studioMemberRoles.userId })
    .from(studioMemberRoles)
    .where(and(...conditions))
  return rows.length
}

// 替换成员角色列表（先删后加）
export async function setStudioMemberRoles(studioId: string, userId: string, roleCodes: UserRole[]) {
  await db.transaction(async (tx) => {
    await tx.delete(studioMemberRoles)
      .where(and(eq(studioMemberRoles.studioId, studioId), eq(studioMemberRoles.userId, userId)))
    for (const roleCode of roleCodes) {
      await tx.insert(studioMemberRoles).values({ studioId, userId, roleCode }).onConflictDoNothing()
    }
  })
}

export async function setStudioMemberActive(studioId: string, userId: string, isActive: boolean) {
  await db.update(studioMembers)
    .set({ isActive })
    .where(and(eq(studioMembers.studioId, studioId), eq(studioMembers.userId, userId)))
}

// 移除成员（角色与用户级权限随成员关系级联删除）
export async function removeStudioMember(studioId: string, userId: string) {
  await db.delete(studioMembers)
    .where(and(eq(studioMembers.studioId, studioId), eq(studioMembers.userId, userId)))
}
