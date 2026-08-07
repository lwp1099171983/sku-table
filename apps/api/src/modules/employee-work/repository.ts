import { and, asc, count, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { EmployeeWorkListQueryDto } from '@sku-table/shared'
import { db } from '../../db/client.js'
import { employeeWorkBatches, employeeWorkItems, employees, shops } from '../../db/schema.js'
import type { ParsedEmployeeWorkItem } from './parser.js'

const INSERT_CHUNK_SIZE = 1_000

async function getShopName(shopId: string) {
  const [row] = await db.select({ name: shops.name }).from(shops).where(eq(shops.id, shopId)).limit(1)
  return row?.name ?? shopId
}

function toPublicBatch(batch: typeof employeeWorkBatches.$inferSelect, shopName: string) {
  return {
    id: batch.id,
    shopId: batch.shopId,
    shopName,
    employeeName: batch.employeeName,
    employeeId: batch.employeeId,
    workDate: batch.workDate,
    fileName: batch.fileName,
    uploadedBy: batch.uploadedBy,
    totalRows: batch.totalRows,
    createdAt: batch.createdAt.toISOString(),
  }
}

export async function createEmployeeWorkImport(input: {
  shopId: string
  employeeName: string
  workDate: string
  fileName: string
  uploadedBy: string
  items: ParsedEmployeeWorkItem[]
}) {
  const batch = await db.transaction(async (tx) => {
    // 按 (shopId, lower(name)) 幂等 upsert 员工档案，拿到 employeeId
    const [createdEmployee] = await tx.insert(employees)
      .values({ shopId: input.shopId, name: input.employeeName })
      .onConflictDoNothing()
      .returning({ id: employees.id })

    let employeeId = createdEmployee?.id
    if (!employeeId) {
      // 并发插入冲突时回查已有档案
      const [existingEmployee] = await tx.select({ id: employees.id })
        .from(employees)
        .where(and(
          eq(employees.shopId, input.shopId),
          sql`lower(${employees.name}) = ${input.employeeName.toLowerCase()}`,
        ))
        .limit(1)
      if (!existingEmployee) {
        throw new Error('员工档案创建失败。')
      }
      employeeId = existingEmployee.id
    }

    const [createdBatch] = await tx.insert(employeeWorkBatches).values({
      shopId: input.shopId,
      employeeId,
      employeeName: input.employeeName,
      workDate: input.workDate,
      fileName: input.fileName,
      uploadedBy: input.uploadedBy,
      totalRows: input.items.length,
    }).returning()

    if (!createdBatch) {
      throw new Error('员工工作批次创建失败。')
    }

    for (let start = 0; start < input.items.length; start += INSERT_CHUNK_SIZE) {
      const chunk = input.items.slice(start, start + INSERT_CHUNK_SIZE)
      await tx.insert(employeeWorkItems).values(chunk.map((item) => ({
        batchId: createdBatch.id,
        shopId: input.shopId,
        seq: item.seq,
        sku: item.sku,
        platform: item.platform,
        name: item.name,
        url: item.url,
        spec: item.spec,
        price: item.price,
      })))
    }

    return createdBatch
  })

  return toPublicBatch(batch, await getShopName(batch.shopId))
}

// 列表：shopIds 为 null 表示不限店铺（管理员"全部"视图）
export async function listEmployeeWorkItems(
  shopIds: string[] | null,
  query: Required<Pick<EmployeeWorkListQueryDto, 'page' | 'pageSize'>> & Omit<EmployeeWorkListQueryDto, 'page' | 'pageSize'>,
) {
  const filters: SQL[] = [
    isNull(employeeWorkBatches.archivedAt),
  ]
  if (shopIds) filters.push(inArray(employeeWorkBatches.shopId, shopIds))
  if (query.employeeName) filters.push(eq(employeeWorkBatches.employeeName, query.employeeName))
  if (query.workDate) filters.push(eq(employeeWorkBatches.workDate, query.workDate))
  if (query.sku) filters.push(ilike(employeeWorkItems.sku, `%${query.sku}%`))
  const where = filters.length > 0 ? and(...filters) : undefined

  const [{ total }] = await db.select({ total: count(employeeWorkItems.id) })
    .from(employeeWorkItems)
    .innerJoin(employeeWorkBatches, eq(employeeWorkItems.batchId, employeeWorkBatches.id))
    .where(where)

  const rows = await db.select({
    id: employeeWorkItems.id,
    batchId: employeeWorkItems.batchId,
    shopId: employeeWorkItems.shopId,
    shopName: shops.name,
    seq: employeeWorkItems.seq,
    sku: employeeWorkItems.sku,
    platform: employeeWorkItems.platform,
    name: employeeWorkItems.name,
    url: employeeWorkItems.url,
    spec: employeeWorkItems.spec,
    price: employeeWorkItems.price,
    employeeName: employeeWorkBatches.employeeName,
    workDate: employeeWorkBatches.workDate,
  })
    .from(employeeWorkItems)
    .innerJoin(employeeWorkBatches, eq(employeeWorkItems.batchId, employeeWorkBatches.id))
    .innerJoin(shops, eq(employeeWorkBatches.shopId, shops.id))
    .where(where)
    .orderBy(desc(employeeWorkBatches.workDate), desc(employeeWorkItems.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)

  return {
    items: rows.map((row) => ({
      ...row,
      id: Number(row.id),
      price: row.price ?? null,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: Number(total),
  }
}

// 员工姓名列表（去重，不限店铺时返回全部可访问店铺的并集）
export async function listEmployeeNames(shopIds: string[] | null) {
  const rows = await db.select({ employeeName: employees.name })
    .from(employees)
    .where(and(
      shopIds ? inArray(employees.shopId, shopIds) : undefined,
      eq(employees.isActive, true),
    ))
    .orderBy(asc(employees.name))

  return [...new Set(rows.map((row) => row.employeeName))]
}

// 硬删除明细并同步扣减批次 total_rows（不低于 0），返回删除条数
async function deleteItemsByIds(ids: number[], shopIds: string[] | null) {
  const scope = shopIds ? inArray(employeeWorkItems.shopId, shopIds) : undefined
  const targets = await db.select({
    id: employeeWorkItems.id,
    batchId: employeeWorkItems.batchId,
  })
    .from(employeeWorkItems)
    .where(and(inArray(employeeWorkItems.id, ids), scope))

  if (targets.length === 0) {
    return 0
  }

  await db.transaction(async (tx) => {
    await tx.delete(employeeWorkItems)
      .where(and(inArray(employeeWorkItems.id, targets.map((row) => row.id)), scope))

    // 按批次统计删除数并扣减 total_rows
    const perBatch = new Map<string, number>()
    for (const row of targets) {
      perBatch.set(row.batchId, (perBatch.get(row.batchId) ?? 0) + 1)
    }
    for (const [batchId, delta] of perBatch) {
      await tx.update(employeeWorkBatches)
        .set({
          totalRows: sql`greatest(${employeeWorkBatches.totalRows} - ${delta}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(employeeWorkBatches.id, batchId))
    }
  })

  return targets.length
}

export async function deleteEmployeeWorkItem(id: number, shopIds: string[] | null) {
  return deleteItemsByIds([id], shopIds)
}

export async function deleteEmployeeWorkItems(ids: number[], shopIds: string[] | null) {
  return deleteItemsByIds(ids, shopIds)
}
