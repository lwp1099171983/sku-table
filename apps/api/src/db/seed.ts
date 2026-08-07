import bcrypt from 'bcryptjs'
import { sql } from 'drizzle-orm'
import { ALL_ROLE_CODES, PERMISSION_CATALOG, ROLE_CATALOG, ROLE_PERMISSIONS } from '../modules/auth/rbac.js'
import { db, closeDatabase } from './client.js'
import { appUsers, permissions, rolePermissions, roles, shops } from './schema.js'

const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase()
const password = process.env.SEED_USER_PASSWORD
const shopName = process.env.SEED_SHOP_NAME?.trim() || '默认店铺'

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

    // 2. 管理员账号（重复执行只更新密码、展示名与全局管理员标记）
    const [admin] = await tx.insert(appUsers).values({
      email,
      passwordHash,
      displayName: '管理员',
      isAdmin: true,
      isActive: true,
    }).onConflictDoUpdate({
      target: appUsers.email,
      set: { passwordHash, displayName: '管理员', isAdmin: true, isActive: true, updatedAt: new Date() },
    }).returning({ id: appUsers.id, email: appUsers.email })

    if (!admin) {
      throw new Error('管理员账号创建失败。')
    }

    // 3. 默认店铺（名称唯一，重复执行不会创建重复店铺）
    const [shop] = await tx.insert(shops).values({ name: shopName }).onConflictDoNothing().returning({ id: shops.id })
    const [existingShop] = shop
      ? []
      : await tx.select({ id: shops.id }).from(shops)
        .where(sql`lower(${shops.name}) = ${shopName.toLowerCase()}`).limit(1)
    const shopId = shop?.id ?? existingShop?.id

    if (!shopId) {
      throw new Error('默认店铺创建失败。')
    }

    console.log(`RBAC 目录已准备：${ROLE_CATALOG.length} 个角色、${PERMISSION_CATALOG.length} 个权限。`)
    console.log(`默认店铺：${shopName}（${shopId}）`)
    console.log(`登录账号已准备：${admin.email}（admin，${admin.id}）`)
  })
}

void seed()
  .catch((error) => {
    console.error('数据库初始化失败。', error)
    process.exitCode = 1
  })
  .finally(() => closeDatabase())
