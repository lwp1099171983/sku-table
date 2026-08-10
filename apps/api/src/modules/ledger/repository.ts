import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { LedgerListQueryDto, LedgerStats, UserRole } from '@sku-table/shared'
import { Decimal } from 'decimal.js'
import { db } from '../../db/client.js'
import { ledgerBatches, ledgerItems, shopMemberRoles, shopMembers, shops } from '../../db/schema.js'
import { hashLedgerItems } from '../imports/idempotency.js'
import { calculateLedgerStats, calculateLedgerValues, parseLedgerAmount, roundLedgerMoney } from './calculation.js'
import { dedupeLedgerItemsByOrderNo } from './dedupe.js'
import type { ParsedLedgerItem } from './parser.js'

const INSERT_CHUNK_SIZE = 1_000

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const ledgerItemSelection = {
  id: ledgerItems.id,
  batchId: ledgerItems.batchId,
  shopId: ledgerItems.shopId,
  shopName: shops.name,
  seq: ledgerItems.seq,
  month: ledgerItems.month,
  orderDate: ledgerItems.orderDate,
  orderNo: ledgerItems.orderNo,
  sku: ledgerItems.sku,
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
}

// 台账导入目标店铺不属于导入者时抛出，路由层转 403
export class ShopAccessForbiddenError extends Error {
  constructor(shopName: string) {
    super(`无权向店铺「${shopName}」导入台账数据。`)
    this.name = 'ShopAccessForbiddenError'
  }
}

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

// 非管理员导入者向已存在店铺写入时，必须是被分配且启用的店铺成员（规格 3.3）
async function assertImporterCanWrite(
  tx: Tx,
  shopId: string,
  shopName: string,
  importer: { id: string; isAdmin: boolean },
) {
  if (importer.isAdmin) return
  const [member] = await tx.select({ userId: shopMembers.userId })
    .from(shopMembers)
    .where(and(
      eq(shopMembers.shopId, shopId),
      eq(shopMembers.userId, importer.id),
      eq(shopMembers.isActive, true),
    ))
    .limit(1)
  if (!member) {
    throw new ShopAccessForbiddenError(shopName)
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
    await assertImporterCanWrite(tx, existing.id, shopName, importer)
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
  await assertImporterCanWrite(tx, retry.id, shopName, importer)
  return retry.id
}

// 台账导入：按 Excel"店铺"列分组写入批次，店铺不存在自动创建
export async function createLedgerImport(input: {
  fileName: string
  uploadedBy: string
  importer: { id: string; isAdmin: boolean; roles: UserRole[] }
  items: ParsedLedgerItem[]
}) {
  const deduped = dedupeLedgerItemsByOrderNo(input.items)

  // 按店铺分组
  const byShop = new Map<string, ParsedLedgerItem[]>()
  for (const item of deduped.items) {
    const list = byShop.get(item.shopName) ?? []
    list.push(item)
    byShop.set(item.shopName, list)
  }

  // 幂等指纹：基于解析后的业务数据（排除自动序号），事务外计算以缩短持锁时间
  const fingerprints = new Map<string, string>()
  for (const [shopName, shopItems] of byShop) {
    fingerprints.set(shopName, hashLedgerItems(shopItems))
  }

  const { batches, reused, importedRows, skippedRows } = await db.transaction(async (tx) => {
    const results: Awaited<ReturnType<typeof toPublicBatch>>[] = []
    let reusedCount = 0
    let importedRows = 0
    let skippedRows = deduped.skippedRows

    for (const [shopName, shopItems] of byShop) {
      const shopId = await findOrCreateShop(tx, shopName, input.importer)
      const idempotencyKey = fingerprints.get(shopName) ?? ''
      // 幂等插入：同店铺+同文件指纹的批次已存在时复用，不再写入明细
      const [createdBatch] = await tx.insert(ledgerBatches).values({
        shopId,
        fileName: input.fileName,
        uploadedBy: input.uploadedBy,
        idempotencyKey,
        totalRows: 0,
      }).onConflictDoNothing().returning()

      if (!createdBatch) {
        // 并发冲突时回查已有批次（与店铺自动创建同模式）
        const [existing] = await tx.select()
          .from(ledgerBatches)
          .where(and(
            eq(ledgerBatches.shopId, shopId),
            eq(ledgerBatches.idempotencyKey, idempotencyKey),
          ))
          .limit(1)
        if (!existing) {
          throw new Error('台账批次创建失败。')
        }
        results.push(toPublicBatch(existing, shopName))
        reusedCount += 1
        skippedRows += shopItems.length
        continue
      }

      let importedForShop = 0
      for (let start = 0; start < shopItems.length; start += INSERT_CHUNK_SIZE) {
        const chunk = shopItems.slice(start, start + INSERT_CHUNK_SIZE)
        const inserted = await tx.insert(ledgerItems).values(chunk.map((item) => ({
          batchId: createdBatch.id,
          shopId,
          seq: item.seq,
          month: item.month,
          orderDate: item.orderDate,
          orderNo: item.orderNo,
          sku: item.sku,
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
        }))).onConflictDoNothing().returning({ id: ledgerItems.id })
        importedForShop += inserted.length
      }

      await tx.update(ledgerBatches)
        .set({ totalRows: importedForShop, updatedAt: new Date() })
        .where(eq(ledgerBatches.id, createdBatch.id))

      importedRows += importedForShop
      skippedRows += shopItems.length - importedForShop
      results.push(toPublicBatch({ ...createdBatch, totalRows: importedForShop }, shopName))
    }

    return {
      batches: results,
      reused: reusedCount === results.length && results.length > 0,
      importedRows,
      skippedRows,
    }
  })

  return { batches, reused, importedRows, skippedRows }
}

// 列表：shopIds 为 null 表示不限店铺（管理员"全部"视图）；统计基于全部筛选行
export async function listLedgerItems(
  shopIds: string[] | null,
  query: Required<Pick<LedgerListQueryDto, 'page' | 'pageSize'>> & Omit<LedgerListQueryDto, 'page' | 'pageSize'>,
  includeStats = true,
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

  let stats: LedgerStats | undefined
  if (includeStats) {
    // 统计：读取全部筛选行的数值列，在应用层求和（不受分页影响）
    const sumRows = await db.select({
      purchaseAmount: ledgerItems.purchaseAmount,
      revenue: ledgerItems.salePrice,
      freight: ledgerItems.freight,
      commission: ledgerItems.commission,
    })
      .from(ledgerItems)
      .where(where)
    const sums = {
      purchaseAmount: new Decimal(0),
      revenue: new Decimal(0),
      freight: new Decimal(0),
      commission: new Decimal(0),
    }
    const addAmount = (total: Decimal, value: string | null) => {
      const amount = parseLedgerAmount(value)
      return amount ? total.plus(roundLedgerMoney(amount)) : total
    }
    for (const row of sumRows) {
      sums.purchaseAmount = addAmount(sums.purchaseAmount, row.purchaseAmount)
      sums.revenue = addAmount(sums.revenue, row.revenue)
      sums.freight = addAmount(sums.freight, row.freight)
      sums.commission = addAmount(sums.commission, row.commission)
    }
    stats = calculateLedgerStats(sums)
  }

  const rows = await db.select(ledgerItemSelection)
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
    stats,
  }
}

export async function getLedgerItemShopId(id: number) {
  const [row] = await db.select({ shopId: ledgerItems.shopId })
    .from(ledgerItems)
    .where(eq(ledgerItems.id, id))
    .limit(1)
  return row?.shopId ?? null
}

export async function updateLedgerItemWeight(id: number, packageWeight: number) {
  return db.transaction(async (tx) => {
    const [item] = await tx.select(ledgerItemSelection)
      .from(ledgerItems)
      .innerJoin(shops, eq(ledgerItems.shopId, shops.id))
      .where(eq(ledgerItems.id, id))
      .limit(1)
    if (!item) return null

    const calculated = calculateLedgerValues({
      salePrice: item.salePrice,
      purchaseAmount: item.purchaseAmount,
      channelName: item.channelName,
      packageWeight,
    })

    const [updated] = await tx.update(ledgerItems)
      .set(calculated)
      .where(eq(ledgerItems.id, id))
      .returning({ id: ledgerItems.id })
    if (!updated) return null

    return {
      ...item,
      ...calculated,
      id: Number(item.id),
    }
  })
}

// 台账批次列表（按导入时间倒序，用于追溯导入来源）
export async function listLedgerBatches(shopIds: string[] | null, page: number, pageSize: number) {
  const filters: SQL[] = []
  if (shopIds) filters.push(inArray(ledgerBatches.shopId, shopIds))
  const where = filters.length > 0 ? and(...filters) : undefined

  const [{ total }] = await db.select({ total: count(ledgerBatches.id) })
    .from(ledgerBatches)
    .where(where)

  const rows = await db.select({
    id: ledgerBatches.id,
    shopId: ledgerBatches.shopId,
    shopName: shops.name,
    fileName: ledgerBatches.fileName,
    uploadedBy: ledgerBatches.uploadedBy,
    totalRows: ledgerBatches.totalRows,
    createdAt: ledgerBatches.createdAt,
  })
    .from(ledgerBatches)
    .innerJoin(shops, eq(ledgerBatches.shopId, shops.id))
    .where(where)
    .orderBy(desc(ledgerBatches.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total: Number(total),
  }
}

// 硬删除明细并同步扣减批次 total_rows（不低于 0），返回实际删除条数
// 用 DELETE ... RETURNING 在事务内拿到真实删除行，避免并发重复删除时按"预查询行数"重复扣减
async function deleteItemsByIds(ids: number[], shopIds: string[] | null) {
  const scope = shopIds ? inArray(ledgerItems.shopId, shopIds) : undefined

  return db.transaction(async (tx) => {
    const deletedRows = await tx.delete(ledgerItems)
      .where(and(inArray(ledgerItems.id, ids), scope))
      .returning({ batchId: ledgerItems.batchId })

    if (deletedRows.length === 0) {
      return 0
    }

    const perBatch = new Map<string, number>()
    for (const row of deletedRows) {
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

    return deletedRows.length
  })
}

export async function deleteLedgerItem(id: number, shopIds: string[] | null) {
  return deleteItemsByIds([id], shopIds)
}

export async function deleteLedgerItems(ids: number[], shopIds: string[] | null) {
  return deleteItemsByIds(ids, shopIds)
}
