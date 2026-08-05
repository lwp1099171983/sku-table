import { and, count, desc, eq } from 'drizzle-orm'
import type { ImportBatch, PageResult, Product } from '@sku-table/shared'
import { db } from '../../db/client.js'
import { appUsers, importBatches, products } from '../../db/schema.js'
import type { ParsedEmployeeWorkItem } from '../employee-work/parser.js'

const INSERT_CHUNK_SIZE = 500

function toPublicBatch(batch: typeof importBatches.$inferSelect): ImportBatch {
  return {
    id: batch.id,
    fileName: batch.fileName,
    status: batch.status,
    totalRows: batch.totalRows,
    successRows: batch.successRows,
    failedRows: batch.failedRows,
    errorRows: batch.errorRows,
    createdBy: batch.createdBy,
    createdAt: batch.createdAt.toISOString(),
    startedAt: batch.startedAt ? batch.startedAt.toISOString() : null,
    finishedAt: batch.finishedAt ? batch.finishedAt.toISOString() : null,
  }
}

function toPublicProduct(
  row: typeof products.$inferSelect,
  uploader: Pick<typeof appUsers.$inferSelect, 'id' | 'email' | 'displayName'> | null,
): Product {
  return {
    id: Number(row.id),
    batchId: row.batchId,
    seq: row.seq ?? null,
    sku: row.sku ?? null,
    platform: row.platform ?? null,
    name: row.name,
    url: row.url ?? null,
    spec: row.spec ?? null,
    price: row.price ?? null,
    internalNote: row.internalNote ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    uploader,
  }
}

export async function createProductImport(input: {
  studioId: string
  fileName: string
  createdBy: string
  items: ParsedEmployeeWorkItem[]
}) {
  const batch = await db.transaction(async (tx) => {
    const now = new Date()
    const [createdBatch] = await tx.insert(importBatches).values({
      studioId: input.studioId,
      fileName: input.fileName,
      status: 'succeeded',
      totalRows: input.items.length,
      successRows: input.items.length,
      failedRows: 0,
      errorRows: [],
      createdBy: input.createdBy,
      startedAt: now,
      finishedAt: now,
    }).returning()

    if (!createdBatch) {
      throw new Error('商品导入批次创建失败。')
    }

    for (let start = 0; start < input.items.length; start += INSERT_CHUNK_SIZE) {
      const chunk = input.items.slice(start, start + INSERT_CHUNK_SIZE)
      await tx.insert(products).values(chunk.map((item) => ({
        batchId: createdBatch.id,
        studioId: input.studioId,
        createdBy: input.createdBy,
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

export async function listProducts(input: {
  studioId: string
  page: number
  pageSize: number
  createdBy?: string
}): Promise<PageResult<Product>> {
  const filters = [eq(products.studioId, input.studioId)]
  if (input.createdBy) {
    filters.push(eq(products.createdBy, input.createdBy))
  }
  const where = and(...filters)

  const [{ total }] = await db.select({ total: count(products.id) })
    .from(products)
    .where(where)

  const rows = await db.select({
    id: products.id,
    batchId: products.batchId,
    seq: products.seq,
    sku: products.sku,
    platform: products.platform,
    name: products.name,
    url: products.url,
    spec: products.spec,
    price: products.price,
    internalNote: products.internalNote,
    createdBy: products.createdBy,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
    uploaderId: appUsers.id,
    uploaderEmail: appUsers.email,
    uploaderDisplayName: appUsers.displayName,
  })
    .from(products)
    .innerJoin(appUsers, eq(products.createdBy, appUsers.id))
    .where(where)
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize)

  return {
    items: rows.map((row) => ({
      id: Number(row.id),
      batchId: row.batchId,
      seq: row.seq ?? null,
      sku: row.sku ?? null,
      platform: row.platform ?? null,
      name: row.name,
      url: row.url ?? null,
      spec: row.spec ?? null,
      price: row.price ?? null,
      internalNote: row.internalNote ?? null,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      uploader: {
        id: row.uploaderId,
        email: row.uploaderEmail,
        displayName: row.uploaderDisplayName,
      },
    })),
    page: input.page,
    pageSize: input.pageSize,
    total: Number(total),
  }
}

export async function updateProductInternalNote(input: {
  studioId: string
  productId: number
  internalNote: string
}): Promise<Product | null> {
  const [updatedRow] = await db.update(products)
    .set({ internalNote: input.internalNote, updatedAt: new Date() })
    .where(and(eq(products.studioId, input.studioId), eq(products.id, input.productId)))
    .returning()

  return updatedRow ? toPublicProduct(updatedRow, null) : null
}
