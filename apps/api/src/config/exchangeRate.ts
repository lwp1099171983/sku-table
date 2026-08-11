// 固定汇率：2026-08-11 从 ExchangeRate-API 拉取，1 卢布可兑换的人民币金额
export const EXCHANGE_RATE = {
  rubToCny: '0.0822',
  source: 'https://open.er-api.com/v6/latest/RUB',
  updatedAt: '2026-08-11',
} as const
