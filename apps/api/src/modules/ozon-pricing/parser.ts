import * as XLSX from 'xlsx'

const MAX_ROWS = 50_000
const MAX_FILE_SIZE = 20 * 1024 * 1024

export interface ParsedOzonPricingItem {
  store: string | null
  productName: string
  supplierSku: string | null
  purchasePrice: string | null
  weightKg: string | null
  localSku: string | null
  nameAbbreviation: string | null
  skuPrefix: string | null
  sellingPrice: string | null
  actualMarginRate: string | null
  breakevenSellingPrice: string | null
  priceCheck: boolean
  weightCheck: boolean
  breakevenProfit: string | null
  breakevenMarginRate: string | null
  price1: string | null
  shippingFee: string | null
  commissionRate: string | null
  returnRate: string | null
  sourceUrl: string | null
}

type PricingField = keyof ParsedOzonPricingItem
type RowLocation = { sheetName: string; rowNumber: number }

const headerAliases: Record<string, PricingField> = {
  '店铺': 'store',
  '产品名称': 'productName',
  '档口SKU': 'supplierSku',
  '进价': 'purchasePrice',
  '重量kg': 'weightKg',
  '[本店]SKU': 'localSku',
  '姓名缩写': 'nameAbbreviation',
  'SKU前缀': 'skuPrefix',
  '[本店]卖价': 'sellingPrice',
  '实际利润率': 'actualMarginRate',
  '保本卖价': 'breakevenSellingPrice',
  '价格检测': 'priceCheck',
  '重量检测': 'weightCheck',
  '保本利润': 'breakevenProfit',
  '保本利润率': 'breakevenMarginRate',
  '价格1': 'price1',
  '运费': 'shippingFee',
  '佣金比例': 'commissionRate',
  '退货率': 'returnRate',
  '货源地址': 'sourceUrl',
}

function normalizeHeader(value: unknown) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/[【]/g, '[').replace(/[】]/g, ']').replace(/[\s（）()]/g, '')
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function locationText(location: RowLocation) {
  return `工作表「${location.sheetName}」第 ${location.rowNumber} 行`
}

function normalizeNumber(value: unknown, location: RowLocation, label: string, options: { percent?: boolean; max?: number } = {}) {
  const text = normalizeText(value)
  if (text === null) return null
  const normalized = text.replace(/[￥¥,]/g, '')
  const numeric = Number(normalized.replace(/%$/, ''))
  if (!Number.isFinite(numeric)) throw new Error(`${locationText(location)}的${label}不是有效数字。`)
  let result = numeric
  if (options.percent) {
    result = normalized.endsWith('%') || numeric > 1 ? numeric / 100 : numeric
    if (result < 0 || result > 1) throw new Error(`${locationText(location)}的${label}应在 0% 到 100% 之间。`)
  }
  if (options.max !== undefined && result > options.max) throw new Error(`${locationText(location)}的${label}超出范围。`)
  return String(result)
}

function normalizeBoolean(value: unknown, location: RowLocation, label: string) {
  const text = normalizeText(value)
  if (text === null) return false
  if (['1', 'true', 'yes', '是', '通过', 'ok'].includes(text.toLowerCase())) return true
  if (['0', 'false', 'no', '否', '待检查', '不通过'].includes(text.toLowerCase())) return false
  throw new Error(`${locationText(location)}的${label}只能填写 1/0 或通过/待检查。`)
}

export async function parseOzonPricingFileAsync(file: File): Promise<ParsedOzonPricingItem[]> {
  const fileName = file.name.toLowerCase()
  if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) throw new Error('只支持 .xlsx 或 .xls 文件。')
  if (file.size > MAX_FILE_SIZE) throw new Error('文件不能超过 20MB。')
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
  const requiredFields = Object.values(headerAliases).filter((field, index, fields) => fields.indexOf(field) === index)
  const items: ParsedOzonPricingItem[] = []
  let matchedSheetCount = 0

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
    const headerIndex = rows.findIndex((row) => row.some((header) => headerAliases[normalizeHeader(header)] === 'productName'))
    if (headerIndex < 0) continue

    matchedSheetCount += 1
    const headerMap = new Map<PricingField, number>()
    rows[headerIndex].forEach((header, index) => {
      const field = headerAliases[normalizeHeader(header)]
      if (field && !headerMap.has(field)) headerMap.set(field, index)
    })
    const missing = requiredFields.filter((field) => !headerMap.has(field))
    if (missing.length) throw new Error(`工作表「${sheetName}」缺少表头：${missing.join('、')}。`)

    for (let index = headerIndex + 1; index < rows.length; index += 1) {
      const row = rows[index]
      if (row.every((value) => normalizeText(value) === null)) continue
      const location = { sheetName, rowNumber: index + 1 }
      const cell = (field: PricingField) => row[headerMap.get(field) ?? -1]
      const productName = normalizeText(cell('productName')) ?? ''
      items.push({
        store: normalizeText(cell('store')), productName, supplierSku: normalizeText(cell('supplierSku')),
        purchasePrice: normalizeNumber(cell('purchasePrice'), location, '进价'), weightKg: normalizeNumber(cell('weightKg'), location, '重量kg', { max: 1000 }),
        localSku: normalizeText(cell('localSku')), nameAbbreviation: normalizeText(cell('nameAbbreviation')), skuPrefix: normalizeText(cell('skuPrefix')),
        sellingPrice: normalizeNumber(cell('sellingPrice'), location, '[本店]卖价'), actualMarginRate: normalizeNumber(cell('actualMarginRate'), location, '实际利润率', { percent: true }),
        breakevenSellingPrice: normalizeNumber(cell('breakevenSellingPrice'), location, '保本卖价'), priceCheck: normalizeBoolean(cell('priceCheck'), location, '价格检测'),
        weightCheck: normalizeBoolean(cell('weightCheck'), location, '重量检测'), breakevenProfit: normalizeNumber(cell('breakevenProfit'), location, '保本利润'),
        breakevenMarginRate: normalizeNumber(cell('breakevenMarginRate'), location, '保本利润率', { percent: true }), price1: normalizeNumber(cell('price1'), location, '价格1'),
        shippingFee: normalizeNumber(cell('shippingFee'), location, '运费'), commissionRate: normalizeNumber(cell('commissionRate'), location, '佣金比例', { percent: true }),
        returnRate: normalizeNumber(cell('returnRate'), location, '退货率', { percent: true }), sourceUrl: normalizeText(cell('sourceUrl')),
      })
      if (items.length > MAX_ROWS) throw new Error(`单个文件最多导入 ${MAX_ROWS.toLocaleString()} 行。`)
    }
  }

  if (matchedSheetCount === 0) throw new Error('未找到包含 20 个字段表头的工作表，请确认使用 OZON 选品、定价表模板。')
  return items
}
