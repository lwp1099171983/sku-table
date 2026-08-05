import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { appUsers } from '../../db/schema.js'

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1)
  return user ?? null
}

export async function findActiveUserById(id: string) {
  const [user] = await db.select().from(appUsers).where(eq(appUsers.id, id)).limit(1)
  return user?.isActive ? user : null
}
