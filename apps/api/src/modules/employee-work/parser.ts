import * as XLSX from 'xlsx'
import { assertExcelFile, MAX_ROWS, normalizeHeader, normalizeText } from '../imports/xlsx.js'

const headerAliases: Record<string, keyof ParsedEmployeeWorkItem> = {
  '序号': 'seq',
  '货号': 'sku',
  '采集平台': 'platform',
  '采集商品名称': 'name',
  '采集商品链接': 'url',
  '采集规格': 'spec',
  '采集价格(CNY)': 'price',
  '采集价格CNY': 'price',
  '采集价格': 'price',
  '价格(CNY)': 'price',
}

export interface ParsedEmployeeWorkItem {
  seq: string | null
  sku: string
  platform: string | null
  name: string
  url: string | null
  spec: string | null
  price: string | null
}

function normalizePrice(value: unknown, rowNumber: number) {
  const text = normalizeText(value)
  if (text === null) return null

  const normalized = text.replace(/[￥¥,]/g, '')
  if (!Number.isFinite(Number(normalized))) {
    throw new Error(`第 ${rowNumber} 行的采集价格不是有效数字。`)
  }
  return normalized
}

export async function parseEmployeeWorkFileAsync(file: File): Promise<ParsedEmployeeWorkItem[]> {
  assertExcelFile(file)
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
  return parseWorkbook(workbook)
}

function parseWorkbook(workbook: XLSX.WorkBook): ParsedEmployeeWorkItem[] {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('Excel 文件没有可读取的工作表。')
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: true,
  })

  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader)
    return headers.includes('货号') && headers.includes('采集商品名称') && headers.some((header) => headerAliases[header] === 'price')
  })
  if (headerIndex < 0) {
    throw new Error('未找到表头，请确认包含：货号、采集商品名称、采集价格(CNY)。')
  }

  const headerMap = new Map<string, number>()
  rows[headerIndex].forEach((header, index) => {
    const field = headerAliases[normalizeHeader(header)]
    if (field && !headerMap.has(field)) headerMap.set(field, index)
  })

  const requiredFields: Array<keyof ParsedEmployeeWorkItem> = ['seq', 'sku', 'platform', 'name', 'url', 'spec', 'price']
  const missingHeaders = requiredFields.filter((field) => !headerMap.has(field))
  if (missingHeaders.length > 0) {
    throw new Error('Excel 缺少必填表头，请使用员工工作记录模板的 7 个字段。')
  }

  const items: ParsedEmployeeWorkItem[] = []
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]
    if (row.every((value) => normalizeText(value) === null)) continue

    const rowNumber = index + 1
    const name = normalizeText(row[headerMap.get('name') ?? -1])
    if (!name) {
      throw new Error(`第 ${rowNumber} 行缺少采集商品名称。`)
    }
    const sku = normalizeText(row[headerMap.get('sku') ?? -1])
    if (!sku) {
      throw new Error(`第 ${rowNumber} 行缺少货号。`)
    }

    items.push({
      seq: normalizeText(row[headerMap.get('seq') ?? -1]),
      sku,
      platform: normalizeText(row[headerMap.get('platform') ?? -1]),
      name,
      url: normalizeText(row[headerMap.get('url') ?? -1]),
      spec: normalizeText(row[headerMap.get('spec') ?? -1]),
      price: normalizePrice(row[headerMap.get('price') ?? -1], rowNumber),
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
