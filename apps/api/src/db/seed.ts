import bcrypt from 'bcryptjs'
import { db, closeDatabase } from './client.js'
import { appUsers } from './schema.js'

const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase()
const password = process.env.SEED_USER_PASSWORD

async function seed() {
  if (!email || !password) {
    throw new Error('请在 apps/api/.env 中设置 SEED_USER_EMAIL 和 SEED_USER_PASSWORD。')
  }
  if (password.length < 8) {
    throw new Error('SEED_USER_PASSWORD 至少需要 8 个字符。')
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const [user] = await db.insert(appUsers).values({
    email,
    passwordHash,
    displayName: '负责人',
    role: 'owner',
    isActive: true,
  }).onConflictDoUpdate({
    target: appUsers.email,
    set: {
      passwordHash,
      displayName: '负责人',
      role: 'owner',
      isActive: true,
      updatedAt: new Date(),
    },
  }).returning({ id: appUsers.id, email: appUsers.email, role: appUsers.role })

  console.log(`登录账号已准备：${user.email}（${user.role}，${user.id}）`)
}

void seed()
  .catch((error) => {
    console.error('登录账号初始化失败。', error)
    process.exitCode = 1
  })
  .finally(() => closeDatabase())
