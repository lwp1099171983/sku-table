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

test('订单号在文件内跨店铺区分大小写去重，空订单号保留', () => {
  const result = dedupeLedgerItemsByOrderNo([
    createItem('ORDER-1', '店铺 A'),
    createItem('ORDER-1', '店铺 B'),
    createItem('order-1', '店铺 B'),
    createItem(null, '店铺 A'),
    createItem(null, '店铺 B'),
  ])

  assert.equal(result.skippedRows, 1)
  assert.deepEqual(result.items.map((item) => [item.shopName, item.orderNo]), [
    ['店铺 A', 'ORDER-1'],
    ['店铺 B', 'order-1'],
    ['店铺 A', null],
    ['店铺 B', null],
  ])
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

const commonHeaders = ['店铺', '订单号', '售价', '采购金额']

test('新台账表头 SKU 可以导入', async () => {
  const [item] = await parseRows([...commonHeaders, 'SKU'], ['测试店铺', 'ORDER-1', '45', '14.9', 'SKU-001'])
  assert.equal(item.sku, 'SKU-001')
})

test('旧台账表头“跟踪号”保持兼容', async () => {
  const [item] = await parseRows([...commonHeaders, '跟踪号'], ['测试店铺', 'ORDER-1', '45', '14.9', 'SKU-OLD'])
  assert.equal(item.sku, 'SKU-OLD')
})

test('订单日期提取年月时兼容横杠、斜杠和中文日期', () => {
  assert.equal(extractOrderMonth('2026-08-11'), '2026-08')
  assert.equal(extractOrderMonth('2026/8/11'), '2026-08')
  assert.equal(extractOrderMonth('2026年8月11日'), '2026-08')
  assert.equal(extractOrderMonth('2026-13-01'), null)
})

test('导入时保存订单年月供月份区间筛选使用', async () => {
  const [item] = await parseRows([...commonHeaders, '订单日期'], ['测试店铺', 'ORDER-1', '45', '14.9', '2026-08-11'])
  assert.equal(item.orderMonth, '2026-08')
})

test('尾程为空时默认按 2% 导入，并兼容旧表头“赔偿”', async () => {
  const [item] = await parseRows([...commonHeaders, '赔偿'], ['测试店铺', 'ORDER-1', '45', '14.9', ''])
  assert.equal(item.tailFee, '2%')
})
