import type { LedgerStats } from '@sku-table/shared'
import { Decimal } from 'decimal.js'
import { findShippingRate } from './shippingRates.js'
import { calculateTailFeeAmount, normalizeTailFeeRate } from './tailFee.js'

const MONEY_DECIMAL_PLACES = 2

export class LedgerCalculationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LedgerCalculationError'
  }
}

export function parseLedgerAmount(value: string | null) {
  if (value === null) return null
  const normalized = value.replace(/[￥¥,，\s]/g, '')
  if (!normalized) return null

  try {
    const amount = new Decimal(normalized)
    return amount.isFinite() ? amount : null
  } catch {
    return null
  }
}

function parseRequiredAmount(value: string | null, fieldName: string) {
  if (value === null) {
    throw new LedgerCalculationError(`${fieldName}不能为空。`)
  }
  const amount = parseLedgerAmount(value)
  if (!amount) {
    throw new LedgerCalculationError(`${fieldName}不是有效数字。`)
  }
  return amount
}

export function roundLedgerMoney(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(MONEY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP)
}

function formatMoney(value: Decimal.Value) {
  return roundLedgerMoney(value).toFixed(MONEY_DECIMAL_PLACES)
}

export function calculateLedgerStats(input: {
  purchaseAmount: Decimal.Value
  revenue: Decimal.Value
  freight: Decimal.Value
  commission: Decimal.Value
  tailFee: Decimal.Value
}): LedgerStats {
  const purchaseAmount = roundLedgerMoney(input.purchaseAmount)
  const revenue = roundLedgerMoney(input.revenue)
  const freight = roundLedgerMoney(input.freight)
  const commission = roundLedgerMoney(input.commission)
  const tailFee = roundLedgerMoney(input.tailFee)
  const grossProfit = roundLedgerMoney(revenue.minus(purchaseAmount).minus(tailFee))
  const netProfit = roundLedgerMoney(grossProfit.minus(freight).minus(commission))
  const withdrawalFee = roundLedgerMoney(revenue.minus(freight).minus(commission).times('0.01'))
  const pureProfit = roundLedgerMoney(netProfit.minus(withdrawalFee))

  return {
    purchaseAmount: purchaseAmount.toNumber(),
    revenue: revenue.toNumber(),
    grossProfit: grossProfit.toNumber(),
    freight: freight.toNumber(),
    commission: commission.toNumber(),
    netProfit: netProfit.toNumber(),
    withdrawalFee: withdrawalFee.toNumber(),
    pureProfit: pureProfit.toNumber(),
  }
}

export function calculateLedgerGrossProfit(input: {
  salePrice: string | null
  purchaseAmount: string | null
  tailFee: string | null
}) {
  const salePrice = parseRequiredAmount(input.salePrice, '售价')
  const purchaseAmount = parseRequiredAmount(input.purchaseAmount, '采购金额')
  const tailFeeAmount = calculateTailFeeAmount(salePrice, input.tailFee)
  const grossProfit = roundLedgerMoney(salePrice.minus(purchaseAmount).minus(tailFeeAmount))

  return {
    tailFeeAmount: formatMoney(tailFeeAmount),
    grossProfit: formatMoney(grossProfit),
  }
}

export function calculateLedgerProfitValues(input: {
  salePrice: string | null
  purchaseAmount: string | null
  freight: string | null
  commission: string | null
  tailFee: string | null
}) {
  const salePrice = parseRequiredAmount(input.salePrice, '售价')
  const freight = roundLedgerMoney(parseRequiredAmount(input.freight, '运费'))
  const commission = roundLedgerMoney(parseRequiredAmount(input.commission, '抽点'))
  const grossValues = calculateLedgerGrossProfit(input)
  const grossProfit = parseRequiredAmount(grossValues.grossProfit, '毛利')
  const netProfit = roundLedgerMoney(grossProfit.minus(freight).minus(commission))
  const ad22 = roundLedgerMoney(salePrice.times('0.22'))
  const ad22Net = roundLedgerMoney(netProfit.minus(ad22))
  const ad30 = roundLedgerMoney(salePrice.times('0.3'))
  const ad30Net = roundLedgerMoney(netProfit.minus(ad30))

  return {
    ...grossValues,
    netProfit: formatMoney(netProfit),
    ad22: formatMoney(ad22),
    ad22Net: formatMoney(ad22Net),
    ad30: formatMoney(ad30),
    ad30Net: formatMoney(ad30Net),
  }
}

export function calculateLedgerValues(input: {
  salePrice: string | null
  purchaseAmount: string | null
  channelName: string | null
  packageWeight: number
  tailFee: string | null
}) {
  if (!Number.isFinite(input.packageWeight) || input.packageWeight < 0) {
    throw new LedgerCalculationError('包裹重量必须是大于等于 0 的数字。')
  }

  const channelName = input.channelName?.trim()
  if (!channelName) {
    throw new LedgerCalculationError('渠道名称不能为空。')
  }
  const rate = findShippingRate(channelName)
  if (!rate) {
    throw new LedgerCalculationError(`渠道「${channelName}」不存在物流资费规则。`)
  }
  if (input.packageWeight > rate.maxWeight) {
    throw new LedgerCalculationError(`包裹重量超过渠道上限 ${rate.maxWeight} 克。`)
  }

  const salePrice = parseRequiredAmount(input.salePrice, '售价')
  const chargeableWeight = Math.max(rate.minWeight, input.packageWeight)
  const freight = roundLedgerMoney(
    new Decimal(rate.basePrice).plus(new Decimal(rate.pricePerGram).times(chargeableWeight)),
  )
  const commissionRate = salePrice.lte(125) ? '0.12' : '0.205'
  const commission = roundLedgerMoney(salePrice.times(commissionRate))
  const profitValues = calculateLedgerProfitValues({
    salePrice: input.salePrice,
    purchaseAmount: input.purchaseAmount,
    freight: formatMoney(freight),
    commission: formatMoney(commission),
    tailFee: input.tailFee,
  })

  return {
    packageWeight: new Decimal(input.packageWeight).toString(),
    tailFee: normalizeTailFeeRate(input.tailFee),
    freight: formatMoney(freight),
    commission: formatMoney(commission),
    grossProfit: profitValues.grossProfit,
    netProfit: profitValues.netProfit,
    ad22: profitValues.ad22,
    ad22Net: profitValues.ad22Net,
    ad30: profitValues.ad30,
    ad30Net: profitValues.ad30Net,
  }
}
