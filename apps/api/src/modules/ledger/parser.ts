import * as XLSX from 'xlsx'
import { assertExcelFile, MAX_ROWS, normalizeHeader, normalizeText } from '../imports/xlsx.js'
import { normalizeTailFeeRate } from './tailFee.js'

// 25 个字段的表头别名映射（normalizeHeader 后的 key）
const headerAliases: Record<string, keyof ParsedLedgerItem> = {
  '序号': 'seq',
  '月份': 'month',
  '订单日期': 'orderDate',
  '店铺': 'shopName',
  '订单号': 'orderNo',
  'SKU': 'sku',
  'sku': 'sku',
  '跟踪号': 'sku', // 兼容旧版台账文件
  '售价': 'salePrice',
  '数量': 'quantity',
  '产品ID': 'quantity', // 用户 Excel 中"数量"对应"产品ID"列
  '单价': 'unitPrice',
  '采购金额': 'purchaseAmount',
  '采购日期': 'purchaseDate',
  '采购平台': 'purchasePlatform',
  '采购订单号': 'purchaseOrderNo',
  '毛利': 'grossProfit',
  '渠道名称': 'channelName',
  '包裹重量': 'packageWeight',
  '运费': 'freight',
  '抽点': 'commission',
  '净利': 'netProfit',
  '广告22%': 'ad22',
  '22%净利': 'ad22Net',
  '广告30%': 'ad30',
  '30%净利': 'ad30Net',
  '尾程': 'tailFee',
  '赔偿': 'tailFee', // 兼容旧版台账文件
  '备注': 'remark',
}

// 解析所需的关键表头（用于定位表头行）
const KEY_HEADERS = ['订单号', '售价', '采购金额', '店铺']

// Excel 是台账最终数据源，重复订单会整行覆盖，因此必须提供全部可导入业务字段。
const REQUIRED_HEADERS: Array<{ field: keyof ParsedLedgerItem; label: string }> = [
  { field: 'seq', label: '序号' },
  { field: 'month', label: '月份' },
  { field: 'orderDate', label: '订单日期' },
  { field: 'shopName', label: '店铺' },
  { field: 'orderNo', label: '订单号' },
  { field: 'sku', label: 'SKU（兼容跟踪号）' },
  { field: 'salePrice', label: '售价' },
  { field: 'quantity', label: '数量（兼容产品ID）' },
  { field: 'unitPrice', label: '单价' },
  { field: 'purchaseAmount', label: '采购金额' },
  { field: 'purchaseDate', label: '采购日期' },
  { field: 'purchasePlatform', label: '采购平台' },
  { field: 'purchaseOrderNo', label: '采购订单号' },
  { field: 'grossProfit', label: '毛利' },
  { field: 'channelName', label: '渠道名称' },
  { field: 'packageWeight', label: '包裹重量' },
  { field: 'freight', label: '运费' },
  { field: 'commission', label: '抽点' },
  { field: 'netProfit', label: '净利' },
  { field: 'ad22', label: '广告22%' },
  { field: 'ad22Net', label: '22%净利' },
  { field: 'ad30', label: '广告30%' },
  { field: 'ad30Net', label: '30%净利' },
  { field: 'tailFee', label: '尾程（兼容赔偿）' },
  { field: 'remark', label: '备注' },
]

export interface ParsedLedgerItem {
  shopName: string
  seq: string | null
  month: string | null
  orderDate: string | null
  orderMonth: string | null
  orderNo: string | null
  sku: string | null
  salePrice: string | null
  quantity: string | null
  unitPrice: string | null
  purchaseAmount: string | null
  purchaseDate: string | null
  purchasePlatform: string | null
  purchaseOrderNo: string | null
  grossProfit: string | null
  channelName: string | null
  packageWeight: string | null
  freight: string | null
  commission: string | null
  netProfit: string | null
  ad22: string | null
  ad22Net: string | null
  ad30: string | null
  ad30Net: string | null
  tailFee: string | null
  remark: string | null
}

// 数值列按原始文本保存（含"超重"等公式错误文本），直接使用 normalizeText，不校验数字

// 从日期文本提取可筛选的年月，兼容 2026-08、2026/08 和 2026年8月格式
export function extractOrderMonth(value: string | null) {
  if (!value) return null
  const match = value.trim().match(/^(\d{4})[-/年]\s*(\d{1,2})/)
  if (!match) return null

  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return `${match[1]}-${String(month).padStart(2, '0')}`
}

// 从订单日期提取显示月份（"2025-10-19..." → "10"）
function extractMonth(orderDate: string | null) {
  const orderMonth = extractOrderMonth(orderDate)
  return orderMonth ? String(Number(orderMonth.slice(-2))) : null
}

function buildHeaderMap(headerRow: unknown[]) {
  const headerMap = new Map<keyof ParsedLedgerItem, number>()
  headerRow.forEach((header, index) => {
    const field = headerAliases[normalizeHeader(header)]
    if (field && !headerMap.has(field)) headerMap.set(field, index)
  })
  return headerMap
}

function findHeaderIndex(rows: unknown[][]) {
  let bestIndex = -1
  let bestHits = 0
  for (let index = 0; index < rows.length; index += 1) {
    const headers = rows[index].map(normalizeHeader)
    const hits = headers.filter((header) => KEY_HEADERS.includes(header)).length
    if (hits > bestHits) {
      bestHits = hits
      bestIndex = index
    }
  }
  // 至少命中 4 个关键表头中的 3 个
  return bestHits >= 3 ? bestIndex : -1
}

// 判断该 sheet 是否包含台账表头（用于定位最相关的报错）
function hasLedgerHeader(rows: unknown[][]) {
  return findHeaderIndex(rows) >= 0
}

// 判断是否为可导入的数据行：必须包含店铺、订单号或售价中的至少一个关键字段。
function isDataRow(row: unknown[], headerMap: Map<keyof ParsedLedgerItem, number>) {
  return (['shopName', 'orderNo', 'salePrice'] as const)
    .some((field) => normalizeText(row[headerMap.get(field) ?? -1]) !== null)
}

function parseSheet(sheet: XLSX.WorkSheet): ParsedLedgerItem[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })

  const headerIndex = findHeaderIndex(rows)
  if (headerIndex < 0) {
    throw new Error('未找到台账表头，请确认包含：店铺、订单号、售价、采购金额。')
  }

  const headerMap = buildHeaderMap(rows[headerIndex])
  const missingHeaders = REQUIRED_HEADERS
    .filter(({ field }) => !headerMap.has(field))
    .map(({ label }) => label)
  if (missingHeaders.length > 0) {
    throw new Error(`Excel 缺少完整台账表头：${missingHeaders.join('、')}。`)
  }

  const items: ParsedLedgerItem[] = []
  let seqCounter = 0

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]
    // 跳过统计区、公式错误残留等非数据行
    if (!isDataRow(row, headerMap)) continue

    const rowNumber = index + 1
    const getField = (field: keyof ParsedLedgerItem) => row[headerMap.get(field) ?? -1]

    const shopName = normalizeText(getField('shopName'))
    if (!shopName) {
      throw new Error(`第 ${rowNumber} 行缺少店铺名称。`)
    }

    seqCounter += 1
    const monthRaw = normalizeText(getField('month'))
    const orderDate = normalizeText(getField('orderDate'))
    const month = monthRaw ?? extractMonth(orderDate)
    const orderMonth = extractOrderMonth(orderDate) ?? extractOrderMonth(monthRaw)

    items.push({
      shopName,
      // 序号为空时按导入顺序自动生成（规格 4.2）
      seq: normalizeText(getField('seq')) ?? String(seqCounter),
      month,
      orderDate,
      orderMonth,
      orderNo: normalizeText(getField('orderNo')),
      sku: normalizeText(getField('sku')),
      salePrice: normalizeText(getField('salePrice')),
      quantity: normalizeText(getField('quantity')),
      unitPrice: normalizeText(getField('unitPrice')),
      purchaseAmount: normalizeText(getField('purchaseAmount')),
      purchaseDate: normalizeText(getField('purchaseDate')),
      purchasePlatform: normalizeText(getField('purchasePlatform')),
      purchaseOrderNo: normalizeText(getField('purchaseOrderNo')),
      grossProfit: normalizeText(getField('grossProfit')),
      channelName: normalizeText(getField('channelName')),
      packageWeight: normalizeText(getField('packageWeight')),
      freight: normalizeText(getField('freight')),
      commission: normalizeText(getField('commission')),
      netProfit: normalizeText(getField('netProfit')),
      ad22: normalizeText(getField('ad22')),
      ad22Net: normalizeText(getField('ad22Net')),
      ad30: normalizeText(getField('ad30')),
      ad30Net: normalizeText(getField('ad30Net')),
      tailFee: normalizeTailFeeRate(normalizeText(getField('tailFee'))),
      remark: normalizeText(getField('remark')),
    })

    if (items.length > MAX_ROWS) {
      throw new Error(`单个文件最多导入 ${MAX_ROWS.toLocaleString()} 行。`)
    }
  }

  if (items.length === 0) {
    throw new Error('Excel 中没有可导入的数据。')
  }

  return items
}

// 按 sheet 顺序查找第一个能解析出台账的 sheet（兼容用户多 tab 文件）
export async function parseLedgerFileAsync(file: File): Promise<ParsedLedgerItem[]> {
  assertExcelFile(file)
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
  let lastError: Error | null = null
  let ledgerSheetError: Error | null = null
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
    })
    try {
      const items = parseSheet(workbook.Sheets[sheetName])
      if (items.length > 0) {
        return items
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('台账 Excel 无法解析。')
      // 已识别为台账 sheet 的报错更贴近真实问题（避免被无表头 sheet 覆盖）
      if (hasLedgerHeader(rows)) {
        ledgerSheetError = lastError
      }
    }
  }
  throw ledgerSheetError ?? lastError ?? new Error('Excel 中没有可导入的台账数据。')
}
