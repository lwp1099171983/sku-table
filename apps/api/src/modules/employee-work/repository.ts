import { and, asc, count, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { EmployeeWorkListQueryDto } from '@sku-table/shared'
import { db } from '../../db/client.js'
import { employeeWorkBatches, employeeWorkItems, employees, shops } from '../../db/schema.js'
import { hashEmployeeWorkItems } from '../imports/idempotency.js'
import type { ParsedEmployeeWorkItem } from './parser.js'

const INSERT_CHUNK_SIZE = 1_000
const SKU_QUERY_CHUNK_SIZE = 10_000

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
    archivedAt: batch.archivedAt?.toISOString() ?? null,
    archivedBy: batch.archivedBy ?? null,
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
  // 幂等指纹：基于解析后的业务数据（排除自动序号，含员工/日期维度），同一份数据重复导入时命中
  const idempotencyKey = hashEmployeeWorkItems({
    shopId: input.shopId,
    employeeName: input.employeeName,
    workDate: input.workDate,
    items: input.items,
  })

  const { batch, reused, importedRows, skippedRows } = await db.transaction(async (tx) => {
    // 锁定店铺行，串行化同一店铺的导入，避免并发导入同时通过货号检查
    await tx.execute(sql`select id from ${shops} where id = ${input.shopId} for update`)

    // 幂等命中：同店铺+同文件指纹的批次已存在时直接复用，不再写入
    const [existingBatch] = await tx.select()
      .from(employeeWorkBatches)
      .where(and(
        eq(employeeWorkBatches.shopId, input.shopId),
        eq(employeeWorkBatches.idempotencyKey, idempotencyKey),
      ))
      .limit(1)
    if (existingBatch) {
      return {
        batch: existingBatch,
        reused: true,
        importedRows: 0,
        skippedRows: input.items.length,
      }
    }

    // 文件内按货号去重，保留首次出现的记录；货号已经在解析阶段保证非空
    const uniqueItemsBySku = new Map<string, ParsedEmployeeWorkItem>()
    for (const item of input.items) {
      const skuKey = item.sku.toLowerCase()
      if (uniqueItemsBySku.has(skuKey)) continue
      uniqueItemsBySku.set(skuKey, item)
    }

    const uniqueItems = [...uniqueItemsBySku.values()]
    const existingSkuKeys = new Set<string>()
    const uniqueSkuKeys = [...uniqueItemsBySku.keys()]
    for (let start = 0; start < uniqueSkuKeys.length; start += SKU_QUERY_CHUNK_SIZE) {
      const chunk = uniqueSkuKeys.slice(start, start + SKU_QUERY_CHUNK_SIZE)
      const rows = await tx.select({ sku: employeeWorkItems.sku })
        .from(employeeWorkItems)
        .where(and(
          eq(employeeWorkItems.shopId, input.shopId),
          inArray(sql`lower(${employeeWorkItems.sku})`, chunk),
        ))
      for (const row of rows) {
        if (row.sku) existingSkuKeys.add(row.sku.toLowerCase())
      }
    }

    const itemsToInsert = uniqueItems.filter((item) => !existingSkuKeys.has(item.sku.toLowerCase()))
    const skippedRows = input.items.length - itemsToInsert.length

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

    // 幂等插入：并发重试同一文件时冲突，回查已有批次
    const [createdBatch] = await tx.insert(employeeWorkBatches).values({
      shopId: input.shopId,
      employeeId,
      employeeName: input.employeeName,
      workDate: input.workDate,
      fileName: input.fileName,
      uploadedBy: input.uploadedBy,
      idempotencyKey,
      totalRows: itemsToInsert.length,
    }).onConflictDoNothing().returning()

    let batch = createdBatch
    if (!batch) {
      const [existing] = await tx.select()
        .from(employeeWorkBatches)
        .where(and(
          eq(employeeWorkBatches.shopId, input.shopId),
          eq(employeeWorkBatches.idempotencyKey, idempotencyKey),
        ))
        .limit(1)
      if (!existing) {
        throw new Error('员工工作批次创建失败。')
      }
      batch = existing
    }

    for (let start = 0; start < itemsToInsert.length; start += INSERT_CHUNK_SIZE) {
      const chunk = itemsToInsert.slice(start, start + INSERT_CHUNK_SIZE)
      await tx.insert(employeeWorkItems).values(chunk.map((item) => ({
        batchId: batch.id,
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

    return {
      batch,
      reused: false,
      importedRows: itemsToInsert.length,
      skippedRows,
    }
  })

  return {
    batch: toPublicBatch(batch, await getShopName(batch.shopId)),
    importedRows,
    skippedRows,
    reused,
  }
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

// 员工工作批次列表（按导入时间倒序，用于追溯导入来源与回滚入口）
export async function listEmployeeWorkBatches(shopIds: string[] | null, page: number, pageSize: number) {
  const filters: SQL[] = []
  if (shopIds) filters.push(inArray(employeeWorkBatches.shopId, shopIds))
  const where = filters.length > 0 ? and(...filters) : undefined

  const [{ total }] = await db.select({ total: count(employeeWorkBatches.id) })
    .from(employeeWorkBatches)
    .where(where)

  const rows = await db.select({
    id: employeeWorkBatches.id,
    shopId: employeeWorkBatches.shopId,
    shopName: shops.name,
    employeeName: employeeWorkBatches.employeeName,
    employeeId: employeeWorkBatches.employeeId,
    workDate: employeeWorkBatches.workDate,
    fileName: employeeWorkBatches.fileName,
    uploadedBy: employeeWorkBatches.uploadedBy,
    totalRows: employeeWorkBatches.totalRows,
    archivedAt: employeeWorkBatches.archivedAt,
    archivedBy: employeeWorkBatches.archivedBy,
    createdAt: employeeWorkBatches.createdAt,
  })
    .from(employeeWorkBatches)
    .innerJoin(shops, eq(employeeWorkBatches.shopId, shops.id))
    .where(where)
    .orderBy(desc(employeeWorkBatches.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map((row) => ({
      ...row,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      archivedBy: row.archivedBy ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total: Number(total),
  }
}

// 按批次回滚：置归档标记（archived_at/archived_by），默认列表查询排除已归档批次
export async function rollbackEmployeeWorkBatch(batchId: string, userId: string) {
  const [updated] = await db.update(employeeWorkBatches)
    .set({ archivedAt: new Date(), archivedBy: userId, updatedAt: new Date() })
    .where(and(eq(employeeWorkBatches.id, batchId), isNull(employeeWorkBatches.archivedAt)))
    .returning()
  if (!updated) {
    return null
  }
  return {
    id: updated.id,
    shopId: updated.shopId,
    shopName: await getShopName(updated.shopId),
    employeeName: updated.employeeName,
    employeeId: updated.employeeId,
    workDate: updated.workDate,
    fileName: updated.fileName,
    uploadedBy: updated.uploadedBy,
    totalRows: updated.totalRows,
    archivedAt: updated.archivedAt?.toISOString() ?? null,
    archivedBy: updated.archivedBy ?? null,
    createdAt: updated.createdAt.toISOString(),
  }
}

// 硬删除明细并同步扣减批次 total_rows（不低于 0），返回实际删除条数
// 用 DELETE ... RETURNING 在事务内拿到真实删除行，避免并发重复删除时按"预查询行数"重复扣减
async function deleteItemsByIds(ids: number[], shopIds: string[] | null) {
  const scope = shopIds ? inArray(employeeWorkItems.shopId, shopIds) : undefined

  return db.transaction(async (tx) => {
    const deletedRows = await tx.delete(employeeWorkItems)
      .where(and(inArray(employeeWorkItems.id, ids), scope))
      .returning({ batchId: employeeWorkItems.batchId })

    if (deletedRows.length === 0) {
      return 0
    }

    // 按批次统计实际删除数并扣减 total_rows
    const perBatch = new Map<string, number>()
    for (const row of deletedRows) {
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

    return deletedRows.length
  })
}

export async function deleteEmployeeWorkItem(id: number, shopIds: string[] | null) {
  return deleteItemsByIds([id], shopIds)
}

export async function deleteEmployeeWorkItems(ids: number[], shopIds: string[] | null) {
  return deleteItemsByIds(ids, shopIds)
}
