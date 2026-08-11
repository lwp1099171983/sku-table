import { Decimal } from 'decimal.js'
import { EXCHANGE_RATE } from '../../config/exchangeRate.js'

export const DEFAULT_TAIL_FEE_RATE = '2%'
const MIN_TAIL_FEE_RUB = new Decimal(15)
const MAX_TAIL_FEE_RUB = new Decimal(200)
const RUB_TO_CNY = new Decimal(EXCHANGE_RATE.rubToCny)

function parseTailFeeRate(value: string | null) {
  const raw = value?.trim()
  if (!raw) return null

  const isPercent = raw.includes('%')
  const normalized = raw.replace(/[%\s]/g, '')
  if (!normalized) return null

  try {
    const parsed = new Decimal(normalized)
    if (!parsed.isFinite() || parsed.isNegative()) return null
    return isPercent || parsed.gte(1) ? parsed.div(100) : parsed
  } catch {
    return null
  }
}

function resolveTailFeeRate(value: string | null) {
  return parseTailFeeRate(value) ?? new Decimal('0.02')
}

// 尾程列保存比例；空值、非法值都按默认 2% 处理，统一为百分比文本
export function normalizeTailFeeRate(value: string | null) {
  return `${resolveTailFeeRate(value).times(100).toString()}%`
}

// 售价先按固定汇率换算为卢布，应用比例与 15~200 卢布边界后再换回人民币
export function calculateTailFeeAmount(salePrice: Decimal.Value, tailFeeRate: string | null) {
  const tailFeeRub = new Decimal(salePrice)
    .div(RUB_TO_CNY)
    .times(resolveTailFeeRate(tailFeeRate))
    .clamp(MIN_TAIL_FEE_RUB, MAX_TAIL_FEE_RUB)
  return tailFeeRub.times(RUB_TO_CNY).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}
