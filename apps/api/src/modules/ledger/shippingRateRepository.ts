import { and, count, desc, eq, sql } from 'drizzle-orm'
import type { ShippingRate, ShippingRateVersion } from '@sku-table/shared'
import { db } from '../../db/client.js'
import { shippingRates, shippingRateVersions } from '../../db/schema.js'
import type { ParsedShippingRate } from './shippingRateParser.js'

export type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

function toVersionDto(row: {
  id: string
  name: string
  sourceFileName: string
  isActive: boolean
  activatedAt: Date | null
  createdAt: Date
  ruleCount: number | string
}): ShippingRateVersion {
  return {
    id: row.id,
    name: row.name,
    sourceFileName: row.sourceFileName,
    isActive: row.isActive,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    ruleCount: Number(row.ruleCount),
  }
}

function toRateDto(row: typeof shippingRates.$inferSelect): ShippingRate {
  return {
    id: Number(row.id),
    channelName: row.channelName,
    basePrice: row.basePrice,
    pricePerGram: row.pricePerGram,
    minWeight: row.minWeight,
    maxWeight: row.maxWeight,
  }
}

const versionSelection = {
  id: shippingRateVersions.id,
  name: shippingRateVersions.name,
  sourceFileName: shippingRateVersions.sourceFileName,
  isActive: shippingRateVersions.isActive,
  activatedAt: shippingRateVersions.activatedAt,
  createdAt: shippingRateVersions.createdAt,
  ruleCount: count(shippingRates.id),
}

export async function listShippingRateVersions(): Promise<ShippingRateVersion[]> {
  const rows = await db.select(versionSelection)
    .from(shippingRateVersions)
    .leftJoin(shippingRates, eq(shippingRates.versionId, shippingRateVersions.id))
    .groupBy(
      shippingRateVersions.id,
      shippingRateVersions.name,
      shippingRateVersions.sourceFileName,
      shippingRateVersions.isActive,
      shippingRateVersions.activatedAt,
      shippingRateVersions.createdAt,
    )
    .orderBy(desc(shippingRateVersions.isActive), desc(shippingRateVersions.createdAt))
  return rows.map(toVersionDto)
}

export async function getShippingRateVersionDetail(versionId: string) {
  const [versionRow] = await db.select(versionSelection)
    .from(shippingRateVersions)
    .leftJoin(shippingRates, eq(shippingRates.versionId, shippingRateVersions.id))
    .where(eq(shippingRateVersions.id, versionId))
    .groupBy(
      shippingRateVersions.id,
      shippingRateVersions.name,
      shippingRateVersions.sourceFileName,
      shippingRateVersions.isActive,
      shippingRateVersions.activatedAt,
      shippingRateVersions.createdAt,
    )
    .limit(1)
  if (!versionRow) return null

  const rates = await db.select()
    .from(shippingRates)
    .where(eq(shippingRates.versionId, versionId))
    .orderBy(shippingRates.channelName)
  return { version: toVersionDto(versionRow), rates: rates.map(toRateDto) }
}

export async function createShippingRateVersion(input: {
  name: string
  sourceFileName: string
  createdBy: string
  rates: ParsedShippingRate[]
}): Promise<ShippingRateVersion> {
  return db.transaction(async (tx) => {
    const [version] = await tx.insert(shippingRateVersions).values({
      name: input.name,
      sourceFileName: input.sourceFileName,
      createdBy: input.createdBy,
    }).returning()
    if (!version) throw new Error('物流资费版本创建失败。')

    await tx.insert(shippingRates).values(input.rates.map((rate) => ({
      versionId: version.id,
      channelName: rate.channelName,
      basePrice: rate.basePrice,
      pricePerGram: rate.pricePerGram,
      minWeight: rate.minWeight,
      maxWeight: rate.maxWeight,
    })))

    return toVersionDto({ ...version, ruleCount: input.rates.length })
  })
}

export async function activateShippingRateVersion(versionId: string, activatedBy: string) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ id: shippingRateVersions.id })
      .from(shippingRateVersions)
      .where(eq(shippingRateVersions.id, versionId))
      .limit(1)
    if (!target) return false

    await tx.update(shippingRateVersions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(shippingRateVersions.isActive, true))
    await tx.update(shippingRateVersions)
      .set({
        isActive: true,
        activatedBy,
        activatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shippingRateVersions.id, versionId))
    return true
  })
}

// 在重量重算事务内读取当前启用规则，版本 ID 会与计算结果一起写入台账。
export async function findActiveShippingRate(tx: DatabaseTransaction, channelName: string) {
  const [rate] = await tx.select({
    versionId: shippingRates.versionId,
    channelName: shippingRates.channelName,
    basePrice: shippingRates.basePrice,
    pricePerGram: shippingRates.pricePerGram,
    minWeight: shippingRates.minWeight,
    maxWeight: shippingRates.maxWeight,
  })
    .from(shippingRates)
    .innerJoin(shippingRateVersions, eq(shippingRateVersions.id, shippingRates.versionId))
    .where(and(
      eq(shippingRateVersions.isActive, true),
      sql`lower(${shippingRates.channelName}) = ${channelName.trim().toLowerCase()}`,
    ))
    .limit(1)
  return rate ?? null
}
