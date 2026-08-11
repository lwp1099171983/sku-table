import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { parseShippingRateFile, ShippingRateFileError } from './shippingRateParser.js'

async function parseRows(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '物流资费表')
  const content = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return parseShippingRateFile(new File([content], '物流资费表.xlsx'))
}

test('物流资费表按表头解析公式和重量范围', async () => {
  const rates = await parseRows([
    ['渠道名称', '代码', '价格公式（自提点）', '重量限制'],
    ['UNI Standard Extra Small UNI', 'UNI', '3元 + 0.035元/克', '1-549克'],
    ['RETS Express Small', '', '18.02+0.050/克', '1 - 500 克'],
  ])

  assert.deepEqual(rates, [
    {
      channelName: 'UNI Standard Extra Small UNI',
      basePrice: '3',
      pricePerGram: '0.035',
      minWeight: 1,
      maxWeight: 549,
    },
    {
      channelName: 'RETS Express Small',
      basePrice: '18.02',
      pricePerGram: '0.05',
      minWeight: 1,
      maxWeight: 500,
    },
  ])
})

test('物流资费表拒绝重复渠道和无法识别的公式', async () => {
  await assert.rejects(
    parseRows([
      ['渠道名称', '价格公式（自提点）', '重量限制'],
      ['重复渠道', '3元 + 0.035元/克', '1-549克'],
      ['重复渠道', '3元 + 0.035元/克', '1-549克'],
    ]),
    ShippingRateFileError,
  )

  await assert.rejects(
    parseRows([
      ['渠道名称', '价格公式（自提点）', '重量限制'],
      ['错误渠道', '按实际重量收费', '1-549克'],
    ]),
    ShippingRateFileError,
  )
})
