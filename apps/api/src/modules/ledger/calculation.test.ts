import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateLedgerPurchaseAmountValues, calculateLedgerStats, calculateLedgerValues, LedgerCalculationError, normalizeEditablePurchaseAmount } from './calculation.js'
import { calculateTailFeeAmount } from './tailFee.js'

const exampleRate = {
  channelName: 'UNI Standard Extra Small UNI',
  basePrice: 3,
  pricePerGram: 0.035,
  minWeight: 1,
  maxWeight: 549,
}

test('按源 Excel 示例重新计算重量相关字段', () => {
  assert.deepEqual(calculateLedgerValues({
    salePrice: '45',
    purchaseAmount: '14.9',
    channelName: 'UNI Standard Extra Small UNI',
    packageWeight: 150,
    tailFee: null,
    rate: exampleRate,
  }), {
    packageWeight: '150',
    tailFee: '2%',
    grossProfit: '28.87',
    freight: '8.25',
    commission: '5.40',
    netProfit: '15.22',
    ad22: '9.90',
    ad22Net: '5.32',
    ad30: '13.50',
    ad30Net: '1.72',
  })
})

test('尾程按比例以卢布限额后换算为人民币', () => {
  assert.equal(calculateTailFeeAmount('45', '2%').toString(), '1.23')
  assert.equal(calculateTailFeeAmount('1000', '2%').toString(), '16.44')
})

test('重量低于渠道下限时按最低计费重量计算，金额四舍五入为两位', () => {
  const result = calculateLedgerValues({
    salePrice: '34',
    purchaseAmount: '9',
    channelName: 'UNI Standard Extra Small UNI',
    packageWeight: 0,
    tailFee: '2%',
    rate: exampleRate,
  })
  assert.equal(result.freight, '3.04')
  assert.equal(result.netProfit, '16.65')
  assert.equal(result.ad22Net, '9.17')
})

test('售价 125 使用 12%，超过 125 使用 20.5% 抽点', () => {
  const common = {
    purchaseAmount: '1',
    channelName: 'UNI Standard Extra Small UNI',
    packageWeight: 1,
    tailFee: '2%',
    rate: exampleRate,
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
    tailFee: '2%',
    rate: exampleRate,
  })

  assert.equal(result.grossProfit, '-0.23')
  assert.equal(result.freight, '3.04')
  assert.equal(result.commission, '0.12')
  assert.equal(result.netProfit, '-3.39')
})

test('顶部统计按两位金额公式计算', () => {
  assert.deepEqual(calculateLedgerStats({
    purchaseAmount: '14.9',
    revenue: '45',
    freight: '8.25',
    commission: '5.4',
    tailFee: '1.23',
  }), {
    purchaseAmount: 14.9,
    revenue: 45,
    grossProfit: 28.87,
    freight: 8.25,
    commission: 5.4,
    netProfit: 15.22,
    withdrawalFee: 0.31,
    pureProfit: 14.91,
  })
})

test('在线采购金额规范化为非负两位小数', () => {
  assert.equal(normalizeEditablePurchaseAmount('0'), '0.00')
  assert.equal(normalizeEditablePurchaseAmount('12'), '12.00')
  assert.equal(normalizeEditablePurchaseAmount('12.3'), '12.30')
  assert.equal(normalizeEditablePurchaseAmount('12.34'), '12.34')

  for (const value of ['', '-1', '1.234', 'abc']) {
    assert.throws(() => normalizeEditablePurchaseAmount(value), LedgerCalculationError)
  }
})

test('修改采购金额只重算利润字段并使用已保存广告费用', () => {
  assert.deepEqual(calculateLedgerPurchaseAmountValues({
    salePrice: '45',
    purchaseAmount: '20',
    freight: '8.25',
    commission: '5.40',
    ad22: '9.90',
    ad30: '13.50',
    tailFee: '2%',
  }), {
    purchaseAmount: '20.00',
    grossProfit: '23.77',
    netProfit: '10.12',
    ad22Net: '0.22',
    ad30Net: '-3.38',
  })
})

test('超重、未知渠道和非法金额拒绝计算', () => {
  assert.throws(() => calculateLedgerValues({
    salePrice: '45',
    purchaseAmount: '14.9',
    channelName: 'UNI Standard Extra Small UNI',
    packageWeight: 550,
    tailFee: '2%',
    rate: exampleRate,
  }), LedgerCalculationError)

  assert.throws(() => calculateLedgerValues({
    salePrice: '45',
    purchaseAmount: '14.9',
    channelName: '不存在的渠道',
    packageWeight: 100,
    tailFee: '2%',
    rate: null,
  }), LedgerCalculationError)

  assert.throws(() => calculateLedgerValues({
    salePrice: '售价错误',
    purchaseAmount: '14.9',
    channelName: 'UNI Standard Extra Small UNI',
    packageWeight: 100,
    tailFee: '2%',
    rate: exampleRate,
  }), LedgerCalculationError)
})
