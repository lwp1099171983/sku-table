import bcrypt from 'bcryptjs'
import { sql } from 'drizzle-orm'
import { ALL_ROLE_CODES, PERMISSION_CATALOG, ROLE_CATALOG, ROLE_PERMISSIONS } from '../modules/auth/rbac.js'
import { db, closeDatabase } from './client.js'
import { appUsers, permissions, rolePermissions, roles, studioMemberRoles, studioMembers, studios } from './schema.js'

const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase()
const password = process.env.SEED_USER_PASSWORD
const studioName = process.env.SEED_STUDIO_NAME?.trim() || '默认工作室'

async function seed() {
  if (!email || !password) {
    throw new Error('请在 apps/api/.env 中设置 SEED_USER_EMAIL 和 SEED_USER_PASSWORD。')
  }
  if (password.length < 8) {
    throw new Error('SEED_USER_PASSWORD 至少需要 8 个字符。')
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await db.transaction(async (tx) => {
    // 1. 角色与权限目录（幂等 upsert）
    for (const role of ROLE_CATALOG) {
      await tx.insert(roles).values(role).onConflictDoUpdate({
        target: roles.code,
        set: { name: role.name, description: role.description },
      })
    }
    for (const permission of PERMISSION_CATALOG) {
      await tx.insert(permissions).values(permission).onConflictDoUpdate({
        target: permissions.code,
        set: { name: permission.name, description: permission.description },
      })
    }
    for (const roleCode of ALL_ROLE_CODES) {
      for (const permissionCode of ROLE_PERMISSIONS[roleCode]) {
        await tx.insert(rolePermissions).values({ roleCode, permissionCode }).onConflictDoNothing()
      }
    }

    // 2. owner 账号（重复执行只更新密码和展示名）
    const [owner] = await tx.insert(appUsers).values({
      email,
      passwordHash,
      displayName: '负责人',
      isActive: true,
    }).onConflictDoUpdate({
      target: appUsers.email,
      set: { passwordHash, displayName: '负责人', isActive: true, updatedAt: new Date() },
    }).returning({ id: appUsers.id, email: appUsers.email })

    if (!owner) {
      throw new Error('owner 账号创建失败。')
    }

    // 3. 默认工作室（名称唯一，重复执行不会创建重复工作室）
    const [studio] = await tx.insert(studios).values({ name: studioName }).onConflictDoNothing().returning({ id: studios.id })
    const [existingStudio] = studio
      ? []
      : await tx.select({ id: studios.id }).from(studios)
        .where(sql`lower(${studios.name}) = ${studioName.toLowerCase()}`).limit(1)
    const studioId = studio?.id ?? existingStudio?.id

    if (!studioId) {
      throw new Error('默认工作室创建失败。')
    }

    // 4. 成员关系与 owner 角色（幂等）
    await tx.insert(studioMembers).values({ studioId, userId: owner.id, isActive: true }).onConflictDoNothing()
    await tx.insert(studioMemberRoles).values({ studioId, userId: owner.id, roleCode: 'owner' }).onConflictDoNothing()

    console.log(`RBAC 目录已准备：${ROLE_CATALOG.length} 个角色、${PERMISSION_CATALOG.length} 个权限。`)
    console.log(`默认工作室：${studioName}（${studioId}）`)
    console.log(`登录账号已准备：${owner.email}（owner，${owner.id}）`)
  })
}

void seed()
  .catch((error) => {
    console.error('数据库初始化失败。', error)
    process.exitCode = 1
  })
  .finally(() => closeDatabase())
