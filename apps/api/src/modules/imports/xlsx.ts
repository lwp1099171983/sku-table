// Excel 导入共享解析工具：行数/大小上限、表头与文本标准化（两个导入器共用）

export const MAX_ROWS = 50_000
export const MAX_FILE_SIZE = 20 * 1024 * 1024

// 校验文件扩展名与大小，不合法时抛出中文错误
export function assertExcelFile(file: File) {
  const fileName = file.name.toLowerCase()
  if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
    throw new Error('只支持 .xlsx 或 .xls 文件。')
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('文件不能超过 20MB。')
  }
}

// 表头标准化：去掉 BOM、空白与中文括号
export function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/[\s（）]/g, '')
}

// 文本标准化：去首尾空白，空字符串返回 null
export function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}
