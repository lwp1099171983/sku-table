import * as XLSX from 'xlsx'
import { assertExcelFile, MAX_ROWS, normalizeHeader, normalizeText } from '../imports/xlsx.js'

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
  '赔偿': 'compensation',
  '备注': 'remark',
}

// 解析所需的关键表头（用于定位表头行）
const KEY_HEADERS = ['订单号', '售价', '采购金额', '店铺']

export interface ParsedLedgerItem {
  shopName: string
  seq: string | null
  month: string | null
  orderDate: string | null
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
  compensation: string | null
  remark: string | null
}

// 数值列按原始文本保存（含"超重"等公式错误文本），直接使用 normalizeText，不校验数字

// 从订单日期提取月份（"2025-10-19..." → "10"）
function extractMonth(orderDate: string | null) {
  if (!orderDate) return null
  const match = orderDate.match(/^\d{4}[-/](\d{1,2})/)
  return match ? String(Number(match[1])) : null
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

// 判断是否为可导入的数据行：必须包含 店铺/订单号/售价 中的至少一个关键字段
function isDataRow(row: unknown[]) {
  return [row[3], row[4], row[5]].some((value) => normalizeText(value) !== null)
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
  for (const key of KEY_HEADERS) {
    const field = headerAliases[key]
    if (!headerMap.has(field)) {
      throw new Error(`Excel 缺少必填表头：${key}。`)
    }
  }

  const items: ParsedLedgerItem[] = []
  let seqCounter = 0

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]
    // 跳过统计区、公式错误残留等非数据行
    if (!isDataRow(row)) continue

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

    items.push({
      shopName,
      // 序号为空时按导入顺序自动生成（规格 4.2）
      seq: normalizeText(getField('seq')) ?? String(seqCounter),
      month,
      orderDate,
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
      compensation: normalizeText(getField('compensation')),
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
