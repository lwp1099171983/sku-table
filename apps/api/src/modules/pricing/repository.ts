import { and, count, desc, eq, ilike, or } from 'drizzle-orm'
import type { PricingListQueryDto } from '@sku-table/shared'
import { db } from '../../db/client.js'
import { pricingItems, pricingBatches } from '../../db/schema.js'
import type { ParsedPricingItem } from './parser.js'

const INSERT_CHUNK_SIZE = 500

function toPublicBatch(batch: typeof pricingBatches.$inferSelect) {
  return { id: batch.id, fileName: batch.fileName, uploadedBy: batch.uploadedBy, totalRows: batch.totalRows, createdAt: batch.createdAt.toISOString() }
}

function toPublicRow(row: typeof pricingItems.$inferSelect) {
  return { ...row, purchasePrice: row.purchasePrice ?? null, weightKg: row.weightKg ?? null, sellingPrice: row.sellingPrice ?? null, actualMarginRate: row.actualMarginRate ?? null, breakevenSellingPrice: row.breakevenSellingPrice ?? null, breakevenProfit: row.breakevenProfit ?? null, breakevenMarginRate: row.breakevenMarginRate ?? null, price1: row.price1 ?? null, shippingFee: row.shippingFee ?? null, commissionRate: row.commissionRate ?? null, returnRate: row.returnRate ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

export async function createPricingImport(input: { fileName: string; uploadedBy: string; items: ParsedPricingItem[] }) {
  const batch = await db.transaction(async (tx) => {
    const [createdBatch] = await tx.insert(pricingBatches).values({ fileName: input.fileName, uploadedBy: input.uploadedBy, totalRows: input.items.length }).returning()
    if (!createdBatch) throw new Error('统计批次创建失败。')
    for (let start = 0; start < input.items.length; start += INSERT_CHUNK_SIZE) {
      const chunk = input.items.slice(start, start + INSERT_CHUNK_SIZE)
      await tx.insert(pricingItems).values(chunk.map((item) => ({ batchId: createdBatch.id, ...item, createdBy: input.uploadedBy })))
    }
    return createdBatch
  })
  return toPublicBatch(batch)
}

export async function listPricing(query: Required<Pick<PricingListQueryDto, 'page' | 'pageSize'>> & Omit<PricingListQueryDto, 'page' | 'pageSize'>) {
  const filters = []
  if (query.store) filters.push(eq(pricingItems.store, query.store))
  if (query.keyword) {
    const keyword = `%${query.keyword}%`
    filters.push(or(
      ilike(pricingItems.store, keyword),
      ilike(pricingItems.productName, keyword),
      ilike(pricingItems.supplierSku, keyword),
      ilike(pricingItems.localSku, keyword),
      ilike(pricingItems.nameAbbreviation, keyword),
      ilike(pricingItems.skuPrefix, keyword),
    ))
  }
  const where = filters.length ? and(...filters) : undefined
  const [{ total }] = await db.select({ total: count(pricingItems.id) }).from(pricingItems).where(where)
  const rows = await db.select().from(pricingItems).where(where).orderBy(desc(pricingItems.createdAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize)
  return { items: rows.map(toPublicRow), page: query.page, pageSize: query.pageSize, total: Number(total) }
}
