import * as XLSX from 'xlsx'
import { Decimal } from 'decimal.js'

const MAX_SHIPPING_RATE_FILE_SIZE = 20 * 1024 * 1024

export interface ParsedShippingRate {
  channelName: string
  basePrice: string
  pricePerGram: string
  minWeight: number
  maxWeight: number
}

export class ShippingRateFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShippingRateFileError'
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function normalizeHeader(value: unknown) {
  return normalizeText(value).replace(/（/g, '(').replace(/）/g, ')')
}

function parseFormula(value: unknown, rowNumber: number) {
  const formula = normalizeText(value)
  const match = formula.match(/^(\d+(?:\.\d+)?)\s*元?\s*\+\s*(\d+(?:\.\d+)?)\s*元?\s*\/\s*克$/)
  if (!match) {
    throw new ShippingRateFileError(`第 ${rowNumber} 行价格公式无法识别，应为“基础价格元 + 每克价格元/克”。`)
  }
  const normalizePrice = (price: string) => {
    const decimal = new Decimal(price)
    if (decimal.decimalPlaces() > 4 || decimal.gte('10000000000')) {
      throw new ShippingRateFileError(`第 ${rowNumber} 行价格最多保留 4 位小数，且不能超过数据库金额范围。`)
    }
    return decimal.toString()
  }
  return { basePrice: normalizePrice(match[1]), pricePerGram: normalizePrice(match[2]) }
}

function parseWeightLimit(value: unknown, rowNumber: number) {
  const weightLimit = normalizeText(value)
  const match = weightLimit.match(/^(\d+)\s*-\s*(\d+)\s*克?$/)
  if (!match) {
    throw new ShippingRateFileError(`第 ${rowNumber} 行重量限制无法识别，应为“最小重量-最大重量克”。`)
  }
  const minWeight = Number(match[1])
  const maxWeight = Number(match[2])
  if (!Number.isSafeInteger(minWeight) || !Number.isSafeInteger(maxWeight) || minWeight < 0 || maxWeight < minWeight) {
    throw new ShippingRateFileError(`第 ${rowNumber} 行重量限制不正确。`)
  }
  return { minWeight, maxWeight }
}

function findShippingRateSheet(workbook: XLSX.WorkBook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false })
    const headerRowIndex = rows.findIndex((row) => {
      const headers = new Set(row.map(normalizeHeader))
      return headers.has('渠道名称') && headers.has('价格公式(自提点)') && headers.has('重量限制')
    })
    if (headerRowIndex >= 0) {
      return { sheetName, rows, headerRowIndex }
    }
  }
  return null
}

// 从含“物流资费表”工作表的 Excel 中提取计算规则，列可调整顺序但表头必须保留。
export async function parseShippingRateFile(file: File): Promise<ParsedShippingRate[]> {
  if (file.size === 0 || file.size > MAX_SHIPPING_RATE_FILE_SIZE) {
    throw new ShippingRateFileError('资费表文件大小必须在 1 B 到 20 MB 之间。')
  }

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer', raw: false })
  } catch {
    throw new ShippingRateFileError('资费表 Excel 无法解析。')
  }

  const sheetData = findShippingRateSheet(workbook)
  if (!sheetData) {
    throw new ShippingRateFileError('未找到包含“渠道名称、价格公式（自提点）、重量限制”表头的物流资费表。')
  }

  const headerIndex = new Map<string, number>()
  for (const [index, value] of sheetData.rows[sheetData.headerRowIndex].entries()) {
    const header = normalizeHeader(value)
    if (header) headerIndex.set(header, index)
  }
  const channelIndex = headerIndex.get('渠道名称')
  const formulaIndex = headerIndex.get('价格公式(自提点)')
  const weightIndex = headerIndex.get('重量限制')
  if (channelIndex === undefined || formulaIndex === undefined || weightIndex === undefined) {
    throw new ShippingRateFileError('物流资费表缺少必要列。')
  }

  const rates: ParsedShippingRate[] = []
  const channelNames = new Set<string>()
  for (let index = sheetData.headerRowIndex + 1; index < sheetData.rows.length; index += 1) {
    const row = sheetData.rows[index]
    const channelName = normalizeText(row[channelIndex])
    if (!channelName) continue
    if (channelName.length > 200) {
      throw new ShippingRateFileError(`第 ${index + 1} 行渠道名称不能超过 200 个字符。`)
    }
    const key = channelName.toLowerCase()
    if (channelNames.has(key)) {
      throw new ShippingRateFileError(`第 ${index + 1} 行渠道名称“${channelName}”重复。`)
    }
    channelNames.add(key)

    const price = parseFormula(row[formulaIndex], index + 1)
    const weight = parseWeightLimit(row[weightIndex], index + 1)
    rates.push({ channelName, ...price, ...weight })
  }

  if (rates.length === 0) {
    throw new ShippingRateFileError('物流资费表没有可导入的规则。')
  }
  return rates
}
