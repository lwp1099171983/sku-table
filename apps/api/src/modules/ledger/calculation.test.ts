import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateLedgerStats, calculateLedgerValues, LedgerCalculationError } from './calculation.js'
import { SHIPPING_RATES } from './shippingRates.js'

test('物流资费表包含源 Excel 的 89 条渠道规则', () => {
  assert.equal(SHIPPING_RATES.length, 89)
})

test('按源 Excel 示例重新计算重量相关字段', () => {
  assert.deepEqual(calculateLedgerValues({
    salePrice: '45',
    purchaseAmount: '14.9',
    channelName: 'UNI Standard Extra Small UNI',
    packageWeight: 150,
  }), {
    packageWeight: '150',
    grossProfit: '30.10',
    freight: '8.25',
    commission: '5.40',
    netProfit: '16.45',
    ad22: '9.90',
    ad22Net: '6.55',
    ad30: '13.50',
    ad30Net: '2.95',
  })
})

test('重量低于渠道下限时按最低计费重量计算，金额四舍五入为两位', () => {
  const result = calculateLedgerValues({
    salePrice: '34',
    purchaseAmount: '9',
    channelName: 'UNI Standard Extra Small UNI',
    packageWeight: 0,
  })
  assert.equal(result.freight, '3.04')
  assert.equal(result.netProfit, '17.88')
  assert.equal(result.ad22Net, '10.40')
})

test('售价 125 使用 12%，超过 125 使用 20.5% 抽点', () => {
  const common = {
    purchaseAmount: '1',
    channelName: 'UNI Standard Extra Small UNI',
    packageWeight: 1,
  }
  assert.equal(calculateLedgerValues({ ...common, salePrice: '125' }).commission, '15.00')
  assert.equal(calculateLedgerValues({ ...common, salePrice: '126' }).commission, '25.83')
})

test('金额使用十进制 ROUND_HALF_UP，净利基于已舍入金额计算', () => {
  const result = calculateLedgerValues({
    salePrice: '1.005',
    purchaseAmount: '0',
    channelName: 'UNI Standard Extra Small UNI',
    packageWeight: 0,
  })

  assert.equal(result.grossProfit, '1.01')
  assert.equal(result.freight, '3.04')
  assert.equal(result.commission, '0.12')
  assert.equal(result.netProfit, '-2.15')
})

test('顶部统计按两位金额公式计算', () => {
  assert.deepEqual(calculateLedgerStats({
    purchaseAmount: '14.9',
    revenue: '45',
    freight: '8.25',
    commission: '5.4',
  }), {
    purchaseAmount: 14.9,
    revenue: 45,
    grossProfit: 30.1,
    freight: 8.25,
    commission: 5.4,
    netProfit: 16.45,
    withdrawalFee: 0.31,
    pureProfit: 16.14,
  })
})

test('超重、未知渠道和非法金额拒绝计算', () => {
  assert.throws(() => calculateLedgerValues({
    salePrice: '45',
    purchaseAmount: '14.9',
    channelName: 'UNI Standard Extra Small UNI',
    packageWeight: 550,
  }), LedgerCalculationError)

  assert.throws(() => calculateLedgerValues({
    salePrice: '45',
    purchaseAmount: '14.9',
    channelName: '不存在的渠道',
    packageWeight: 100,
  }), LedgerCalculationError)

  assert.throws(() => calculateLedgerValues({
    salePrice: '售价错误',
    purchaseAmount: '14.9',
    channelName: 'UNI Standard Extra Small UNI',
    packageWeight: 100,
  }), LedgerCalculationError)
})
