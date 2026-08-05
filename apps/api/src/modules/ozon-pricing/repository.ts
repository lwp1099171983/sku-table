import { and, count, desc, eq, ilike, or } from 'drizzle-orm'
import type { OzonPricingListQueryDto } from '@sku-table/shared'
import { db } from '../../db/client.js'
import { ozonProductPricing, ozonStatisticsBatches } from '../../db/schema.js'
import type { ParsedOzonPricingItem } from './parser.js'

const INSERT_CHUNK_SIZE = 500

function toPublicBatch(batch: typeof ozonStatisticsBatches.$inferSelect) {
  return { id: batch.id, fileName: batch.fileName, uploadedBy: batch.uploadedBy, totalRows: batch.totalRows, createdAt: batch.createdAt.toISOString() }
}

function toPublicRow(row: typeof ozonProductPricing.$inferSelect) {
  return { ...row, purchasePrice: row.purchasePrice ?? null, weightKg: row.weightKg ?? null, sellingPrice: row.sellingPrice ?? null, actualMarginRate: row.actualMarginRate ?? null, breakevenSellingPrice: row.breakevenSellingPrice ?? null, breakevenProfit: row.breakevenProfit ?? null, breakevenMarginRate: row.breakevenMarginRate ?? null, price1: row.price1 ?? null, shippingFee: row.shippingFee ?? null, commissionRate: row.commissionRate ?? null, returnRate: row.returnRate ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

export async function createOzonPricingImport(input: { fileName: string; uploadedBy: string; items: ParsedOzonPricingItem[] }) {
  const batch = await db.transaction(async (tx) => {
    const [createdBatch] = await tx.insert(ozonStatisticsBatches).values({ fileName: input.fileName, uploadedBy: input.uploadedBy, totalRows: input.items.length }).returning()
    if (!createdBatch) throw new Error('OZON 统计批次创建失败。')
    for (let start = 0; start < input.items.length; start += INSERT_CHUNK_SIZE) {
      const chunk = input.items.slice(start, start + INSERT_CHUNK_SIZE)
      await tx.insert(ozonProductPricing).values(chunk.map((item) => ({ batchId: createdBatch.id, ...item, createdBy: input.uploadedBy })))
    }
    return createdBatch
  })
  return toPublicBatch(batch)
}

export async function listOzonPricing(query: Required<Pick<OzonPricingListQueryDto, 'page' | 'pageSize'>> & Omit<OzonPricingListQueryDto, 'page' | 'pageSize'>) {
  const filters = []
  if (query.store) filters.push(eq(ozonProductPricing.store, query.store))
  if (query.keyword) {
    const keyword = `%${query.keyword}%`
    filters.push(or(ilike(ozonProductPricing.productName, keyword), ilike(ozonProductPricing.supplierSku, keyword), ilike(ozonProductPricing.localSku, keyword)))
  }
  const where = filters.length ? and(...filters) : undefined
  const [{ total }] = await db.select({ total: count(ozonProductPricing.id) }).from(ozonProductPricing).where(where)
  const rows = await db.select().from(ozonProductPricing).where(where).orderBy(desc(ozonProductPricing.createdAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize)
  return { items: rows.map(toPublicRow), page: query.page, pageSize: query.pageSize, total: Number(total) }
}
