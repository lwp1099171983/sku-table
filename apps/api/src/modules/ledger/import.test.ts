import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { dedupeLedgerItemsByOrderNo } from './dedupe.js'
import { extractOrderMonth, parseLedgerFileAsync, type ParsedLedgerItem } from './parser.js'

function createItem(orderNo: string | null, shopName = '测试店铺'): ParsedLedgerItem {
  return {
    shopName,
    seq: null,
    month: '10',
    orderDate: '2025-10-19',
    orderMonth: '2025-10',
    orderNo,
    sku: null,
    salePrice: '45',
    quantity: '1',
    unitPrice: '14.9',
    purchaseAmount: '14.9',
    purchaseDate: null,
    purchasePlatform: null,
    purchaseOrderNo: null,
    grossProfit: '30.1',
    channelName: 'UNI Standard Extra Small UNI',
    packageWeight: '150',
    freight: '8.25',
    commission: '5.4',
    netProfit: '16.45',
    ad22: '9.9',
    ad22Net: '6.55',
    ad30: '13.5',
    ad30Net: '2.95',
    tailFee: '2%',
    remark: null,
  }
}

test('订单号在文件内跨店铺区分大小写去重，最后一行生效且空订单号保留', () => {
  const latestItem = createItem('ORDER-1', '店铺 B')
  latestItem.remark = '最后一次修改'
  const result = dedupeLedgerItemsByOrderNo([
    createItem('ORDER-1', '店铺 A'),
    latestItem,
    createItem('order-1', '店铺 B'),
    createItem(null, '店铺 A'),
    createItem(null, '店铺 B'),
  ])

  assert.equal(result.skippedRows, 1)
  assert.deepEqual(result.items.map((item) => [item.shopName, item.orderNo]), [
    ['店铺 B', 'ORDER-1'],
    ['店铺 B', 'order-1'],
    ['店铺 A', null],
    ['店铺 B', null],
  ])
  assert.equal(result.items[0].remark, '最后一次修改')
})

test('SKU 可以重复，不参与导入去重', () => {
  const firstItem = createItem('ORDER-1')
  const secondItem = createItem('ORDER-2')
  firstItem.sku = 'SKU-001'
  secondItem.sku = 'SKU-001'

  const result = dedupeLedgerItemsByOrderNo([firstItem, secondItem])

  assert.equal(result.skippedRows, 0)
  assert.deepEqual(result.items.map((item) => [item.orderNo, item.sku]), [
    ['ORDER-1', 'SKU-001'],
    ['ORDER-2', 'SKU-001'],
  ])
})

async function parseRows(headers: string[], data: unknown[]) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, data]), '订单统计表')
  const content = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return parseLedgerFileAsync(new File([content], 'ledger.xlsx'))
}

const fullHeaders = [
  '序号', '月份', '订单日期', '店铺', '订单号', 'SKU', '售价', '数量', '单价', '采购金额',
  '采购日期', '采购平台', '采购订单号', '毛利', '渠道名称', '包裹重量', '运费', '抽点',
  '净利', '广告22%', '22%净利', '广告30%', '30%净利', '尾程', '备注',
]

function createFullRow(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    '序号': '1',
    '月份': '8',
    '订单日期': '2026-08-11',
    '店铺': '测试店铺',
    '订单号': 'ORDER-1',
    'SKU': 'SKU-001',
    '售价': '45',
    '数量': '1',
    '单价': '14.9',
    '采购金额': '14.9',
    '采购日期': '2026-08-01',
    '采购平台': '测试平台',
    '采购订单号': 'PURCHASE-1',
    '毛利': 'Excel毛利',
    '渠道名称': '测试渠道',
    '包裹重量': '150',
    '运费': 'Excel运费',
    '抽点': 'Excel抽点',
    '净利': 'Excel净利',
    '广告22%': 'Excel广告22',
    '22%净利': 'Excel广告22净利',
    '广告30%': 'Excel广告30',
    '30%净利': 'Excel广告30净利',
    '尾程': '2%',
    '备注': '测试备注',
    ...overrides,
  }
  return fullHeaders.map((header) => values[header] ?? '')
}

test('新台账表头 SKU 可以导入', async () => {
  const [item] = await parseRows(fullHeaders, createFullRow())
  assert.equal(item.sku, 'SKU-001')
})

test('旧台账表头“跟踪号”保持兼容', async () => {
  const headers = fullHeaders.map((header) => header === 'SKU' ? '跟踪号' : header)
  const [item] = await parseRows(headers, createFullRow({ 'SKU': 'SKU-OLD' }))
  assert.equal(item.sku, 'SKU-OLD')
})

test('订单日期提取年月时兼容横杠、斜杠和中文日期', () => {
  assert.equal(extractOrderMonth('2026-08-11'), '2026-08')
  assert.equal(extractOrderMonth('2026/8/11'), '2026-08')
  assert.equal(extractOrderMonth('2026年8月11日'), '2026-08')
  assert.equal(extractOrderMonth('2026-13-01'), null)
})

test('导入时保存订单年月供月份区间筛选使用', async () => {
  const [item] = await parseRows(fullHeaders, createFullRow())
  assert.equal(item.orderMonth, '2026-08')
})

test('尾程为空时默认按 2% 导入，并兼容旧表头“赔偿”', async () => {
  const headers = fullHeaders.map((header) => header === '尾程' ? '赔偿' : header)
  const [item] = await parseRows(headers, createFullRow({ '尾程': '' }))
  assert.equal(item.tailFee, '2%')
})

test('导入保留 Excel 已计算的公式列原始值', async () => {
  const [item] = await parseRows(fullHeaders, createFullRow())

  assert.deepEqual({
    grossProfit: item.grossProfit,
    freight: item.freight,
    commission: item.commission,
    netProfit: item.netProfit,
    ad22: item.ad22,
    ad22Net: item.ad22Net,
    ad30: item.ad30,
    ad30Net: item.ad30Net,
  }, {
    grossProfit: 'Excel毛利',
    freight: 'Excel运费',
    commission: 'Excel抽点',
    netProfit: 'Excel净利',
    ad22: 'Excel广告22',
    ad22Net: 'Excel广告22净利',
    ad30: 'Excel广告30',
    ad30Net: 'Excel广告30净利',
  })
})

test('缺少完整台账表头时拒绝导入', async () => {
  await assert.rejects(
    parseRows(['店铺', '订单号', '售价', '采购金额'], ['测试店铺', 'ORDER-1', '45', '14.9']),
    /Excel 缺少完整台账表头/,
  )
})
