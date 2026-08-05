import { and, asc, count, desc, eq, ilike, isNull, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { EmployeeWorkListQueryDto } from '@sku-table/shared'
import { db } from '../../db/client.js'
import { employeeWorkBatches, employeeWorkItems, employees } from '../../db/schema.js'
import type { ParsedEmployeeWorkItem } from './parser.js'

const INSERT_CHUNK_SIZE = 1_000

function toPublicBatch(batch: typeof employeeWorkBatches.$inferSelect) {
  return {
    id: batch.id,
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
  studioId: string
  employeeName: string
  workDate: string
  fileName: string
  uploadedBy: string
  items: ParsedEmployeeWorkItem[]
}) {
  const batch = await db.transaction(async (tx) => {
    // 按 (studioId, lower(name)) 幂等 upsert 员工档案，拿到 employeeId
    const [createdEmployee] = await tx.insert(employees)
      .values({ studioId: input.studioId, name: input.employeeName })
      .onConflictDoNothing()
      .returning({ id: employees.id })

    let employeeId = createdEmployee?.id
    if (!employeeId) {
      // 并发插入冲突时回查已有档案
      const [existingEmployee] = await tx.select({ id: employees.id })
        .from(employees)
        .where(and(
          eq(employees.studioId, input.studioId),
          sql`lower(${employees.name}) = ${input.employeeName.toLowerCase()}`,
        ))
        .limit(1)
      if (!existingEmployee) {
        throw new Error('员工档案创建失败。')
      }
      employeeId = existingEmployee.id
    }

    const [createdBatch] = await tx.insert(employeeWorkBatches).values({
      studioId: input.studioId,
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
        studioId: input.studioId,
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

  return toPublicBatch(batch)
}

export async function listEmployeeWorkItems(studioId: string, query: Required<Pick<EmployeeWorkListQueryDto, 'page' | 'pageSize'>> & Omit<EmployeeWorkListQueryDto, 'page' | 'pageSize'>) {
  const filters: SQL[] = [
    eq(employeeWorkBatches.studioId, studioId),
    isNull(employeeWorkBatches.archivedAt),
  ]
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

export async function listEmployeeNames(studioId: string) {
  const rows = await db.select({ employeeName: employees.name })
    .from(employees)
    .where(and(
      eq(employees.studioId, studioId),
      eq(employees.isActive, true),
    ))
    .orderBy(asc(employees.name))

  return rows.map((row) => row.employeeName)
}
