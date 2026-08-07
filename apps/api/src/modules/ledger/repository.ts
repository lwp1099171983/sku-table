import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { LedgerListQueryDto, LedgerStats, UserRole } from '@sku-table/shared'
import { db } from '../../db/client.js'
import { ledgerBatches, ledgerItems, shopMemberRoles, shopMembers, shops } from '../../db/schema.js'
import type { ParsedLedgerItem } from './parser.js'

const INSERT_CHUNK_SIZE = 1_000

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

function toPublicBatch(batch: typeof ledgerBatches.$inferSelect, shopName: string) {
  return {
    id: batch.id,
    shopId: batch.shopId,
    shopName,
    fileName: batch.fileName,
    uploadedBy: batch.uploadedBy,
    totalRows: batch.totalRows,
    createdAt: batch.createdAt.toISOString(),
  }
}

// 按名称（忽略大小写）查找店铺，不存在则创建；非管理员导入自动把导入者加入新店铺
async function findOrCreateShop(
  tx: Tx,
  shopName: string,
  importer: { id: string; isAdmin: boolean; roles: UserRole[] },
) {
  const [existing] = await tx.select({ id: shops.id })
    .from(shops)
    .where(sql`lower(${shops.name}) = ${shopName.toLowerCase()}`)
    .limit(1)
  if (existing) {
    return existing.id
  }

  const [created] = await tx.insert(shops).values({ name: shopName })
    .onConflictDoNothing()
    .returning({ id: shops.id })
  const shopId = created?.id
  if (shopId) {
    // 自动创建的店铺对导入者可见（管理员全局可见，无需成员关系）
    if (!importer.isAdmin && importer.roles.length > 0) {
      await tx.insert(shopMembers).values({ shopId, userId: importer.id, isActive: true }).onConflictDoNothing()
      for (const roleCode of importer.roles) {
        await tx.insert(shopMemberRoles).values({ shopId, userId: importer.id, roleCode }).onConflictDoNothing()
      }
    }
    return shopId
  }

  // 并发冲突时回查
  const [retry] = await tx.select({ id: shops.id })
    .from(shops)
    .where(sql`lower(${shops.name}) = ${shopName.toLowerCase()}`)
    .limit(1)
  if (!retry) {
    throw new Error('店铺自动创建失败。')
  }
  return retry.id
}

// 台账导入：按 Excel"店铺"列分组写入批次，店铺不存在自动创建
export async function createLedgerImport(input: {
  fileName: string
  uploadedBy: string
  importer: { id: string; isAdmin: boolean; roles: UserRole[] }
  items: ParsedLedgerItem[]
}) {
  // 按店铺分组
  const byShop = new Map<string, ParsedLedgerItem[]>()
  for (const item of input.items) {
    const list = byShop.get(item.shopName) ?? []
    list.push(item)
    byShop.set(item.shopName, list)
  }

  const batches = await db.transaction(async (tx) => {
    const results: Awaited<ReturnType<typeof toPublicBatch>>[] = []

    for (const [shopName, shopItems] of byShop) {
      const shopId = await findOrCreateShop(tx, shopName, input.importer)
      const [batch] = await tx.insert(ledgerBatches).values({
        shopId,
        fileName: input.fileName,
        uploadedBy: input.uploadedBy,
        totalRows: shopItems.length,
      }).returning()

      if (!batch) {
        throw new Error('台账批次创建失败。')
      }

      for (let start = 0; start < shopItems.length; start += INSERT_CHUNK_SIZE) {
        const chunk = shopItems.slice(start, start + INSERT_CHUNK_SIZE)
        await tx.insert(ledgerItems).values(chunk.map((item) => ({
          batchId: batch.id,
          shopId,
          seq: item.seq,
          month: item.month,
          orderDate: item.orderDate,
          orderNo: item.orderNo,
          trackingNo: item.trackingNo,
          salePrice: item.salePrice,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          purchaseAmount: item.purchaseAmount,
          purchaseDate: item.purchaseDate,
          purchasePlatform: item.purchasePlatform,
          purchaseOrderNo: item.purchaseOrderNo,
          grossProfit: item.grossProfit,
          channelName: item.channelName,
          packageWeight: item.packageWeight,
          freight: item.freight,
          commission: item.commission,
          netProfit: item.netProfit,
          ad22: item.ad22,
          ad22Net: item.ad22Net,
          ad30: item.ad30,
          ad30Net: item.ad30Net,
          compensation: item.compensation,
          remark: item.remark,
        })))
      }

      results.push(toPublicBatch(batch, shopName))
    }

    return results
  })

  return batches
}

// 台账统计（随筛选结果变化）：采购金额/营业额/运费/抽点 为 SUM，其余按公式推导
function computeStats(input: {
  purchaseAmount: number
  revenue: number
  freight: number
  commission: number
}): LedgerStats {
  const { purchaseAmount, revenue, freight, commission } = input
  const grossProfit = revenue - purchaseAmount
  const netProfit = grossProfit - freight - commission
  const withdrawalFee = (revenue - freight - commission) * 0.01
  const pureProfit = netProfit - withdrawalFee

  return {
    purchaseAmount,
    revenue,
    grossProfit,
    freight,
    commission,
    netProfit,
    withdrawalFee,
    pureProfit,
  }
}

// 列表：shopIds 为 null 表示不限店铺（管理员"全部"视图）；统计基于全部筛选行
export async function listLedgerItems(
  shopIds: string[] | null,
  query: Required<Pick<LedgerListQueryDto, 'page' | 'pageSize'>> & Omit<LedgerListQueryDto, 'page' | 'pageSize'>,
) {
  const filters: SQL[] = []
  if (shopIds) filters.push(inArray(ledgerItems.shopId, shopIds))
  if (query.month) filters.push(eq(ledgerItems.month, query.month))
  if (query.keyword) {
    const keywordClause = or(
      ilike(ledgerItems.orderNo, `%${query.keyword}%`),
      ilike(ledgerItems.purchaseOrderNo, `%${query.keyword}%`),
    )
    if (keywordClause) filters.push(keywordClause)
  }
  const where = filters.length > 0 ? and(...filters) : undefined

  const [{ total }] = await db.select({ total: count(ledgerItems.id) })
    .from(ledgerItems)
    .where(where)

  // 统计：读取全部筛选行的数值列，在应用层求和（不受分页影响）
  const sumRows = await db.select({
    purchaseAmount: ledgerItems.purchaseAmount,
    revenue: ledgerItems.salePrice,
    freight: ledgerItems.freight,
    commission: ledgerItems.commission,
  })
    .from(ledgerItems)
    .where(where)
  const sums = sumRows.reduce((acc, row) => {
    const toNumber = (value: string | null) => {
      if (value === null) return 0
      const normalized = value.replace(/[￥¥,，\s]/g, '')
      const number = Number(normalized)
      return Number.isFinite(number) ? number : 0
    }
    acc.purchaseAmount += toNumber(row.purchaseAmount)
    acc.revenue += toNumber(row.revenue)
    acc.freight += toNumber(row.freight)
    acc.commission += toNumber(row.commission)
    return acc
  }, { purchaseAmount: 0, revenue: 0, freight: 0, commission: 0 })

  const rows = await db.select({
    id: ledgerItems.id,
    batchId: ledgerItems.batchId,
    shopId: ledgerItems.shopId,
    shopName: shops.name,
    seq: ledgerItems.seq,
    month: ledgerItems.month,
    orderDate: ledgerItems.orderDate,
    orderNo: ledgerItems.orderNo,
    trackingNo: ledgerItems.trackingNo,
    salePrice: ledgerItems.salePrice,
    quantity: ledgerItems.quantity,
    unitPrice: ledgerItems.unitPrice,
    purchaseAmount: ledgerItems.purchaseAmount,
    purchaseDate: ledgerItems.purchaseDate,
    purchasePlatform: ledgerItems.purchasePlatform,
    purchaseOrderNo: ledgerItems.purchaseOrderNo,
    grossProfit: ledgerItems.grossProfit,
    channelName: ledgerItems.channelName,
    packageWeight: ledgerItems.packageWeight,
    freight: ledgerItems.freight,
    commission: ledgerItems.commission,
    netProfit: ledgerItems.netProfit,
    ad22: ledgerItems.ad22,
    ad22Net: ledgerItems.ad22Net,
    ad30: ledgerItems.ad30,
    ad30Net: ledgerItems.ad30Net,
    compensation: ledgerItems.compensation,
    remark: ledgerItems.remark,
  })
    .from(ledgerItems)
    .innerJoin(shops, eq(ledgerItems.shopId, shops.id))
    .where(where)
    .orderBy(desc(ledgerItems.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)

  return {
    items: rows.map((row) => ({ ...row, id: Number(row.id) })),
    page: query.page,
    pageSize: query.pageSize,
    total: Number(total),
    stats: computeStats(sums),
  }
}

// 硬删除明细并同步扣减批次 total_rows（不低于 0），返回删除条数
async function deleteItemsByIds(ids: number[], shopIds: string[] | null) {
  const scope = shopIds ? inArray(ledgerItems.shopId, shopIds) : undefined
  const targets = await db.select({
    id: ledgerItems.id,
    batchId: ledgerItems.batchId,
  })
    .from(ledgerItems)
    .where(and(inArray(ledgerItems.id, ids), scope))

  if (targets.length === 0) {
    return 0
  }

  await db.transaction(async (tx) => {
    await tx.delete(ledgerItems)
      .where(and(inArray(ledgerItems.id, targets.map((row) => row.id)), scope))

    const perBatch = new Map<string, number>()
    for (const row of targets) {
      perBatch.set(row.batchId, (perBatch.get(row.batchId) ?? 0) + 1)
    }
    for (const [batchId, delta] of perBatch) {
      await tx.update(ledgerBatches)
        .set({
          totalRows: sql`greatest(${ledgerBatches.totalRows} - ${delta}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(ledgerBatches.id, batchId))
    }
  })

  return targets.length
}

export async function deleteLedgerItem(id: number, shopIds: string[] | null) {
  return deleteItemsByIds([id], shopIds)
}

export async function deleteLedgerItems(ids: number[], shopIds: string[] | null) {
  return deleteItemsByIds(ids, shopIds)
}
