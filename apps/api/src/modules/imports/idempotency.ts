import { createHash } from 'node:crypto'
import type { ParsedLedgerItem } from '../ledger/parser.js'
import type { ParsedEmployeeWorkItem } from '../employee-work/parser.js'

// 规范化指纹：对解析后的业务数据做 SHA-256，而非原始文件字节。
// Excel/WPS 每次保存都会改写 zip 元数据（修改时间、作者、内部 ID），
// 按字节 hash 会让"同一个 Excel"每次指纹都不同；按业务数据 hash 则只随数据内容变化。
const ROW_SEPARATOR = '\x1e'
const FIELD_SEPARATOR = '\x1f'

function updateRow(hash: ReturnType<typeof createHash>, values: Array<string | null>) {
  hash.update(values.map((value) => value ?? '').join(FIELD_SEPARATOR))
  hash.update(ROW_SEPARATOR)
}

// 台账指纹：排除自动生成的序号（seq），其余业务字段按固定顺序归一化
export function hashLedgerItems(items: ParsedLedgerItem[]): string {
  const hash = createHash('sha256')
  for (const item of items) {
    updateRow(hash, [
      item.month,
      item.orderDate,
      item.orderNo,
      item.trackingNo,
      item.salePrice,
      item.quantity,
      item.unitPrice,
      item.purchaseAmount,
      item.purchaseDate,
      item.purchasePlatform,
      item.purchaseOrderNo,
      item.grossProfit,
      item.channelName,
      item.packageWeight,
      item.freight,
      item.commission,
      item.netProfit,
      item.ad22,
      item.ad22Net,
      item.ad30,
      item.ad30Net,
      item.compensation,
      item.remark,
    ])
  }
  return hash.digest('hex')
}

// 员工工作指纹：排除自动生成的序号（seq），纳入员工/日期维度防止同店铺不同员工内容相同而冲突
export function hashEmployeeWorkItems(input: {
  shopId: string
  employeeName: string
  workDate: string
  items: ParsedEmployeeWorkItem[]
}): string {
  const hash = createHash('sha256')
  // 员工姓名忽略大小写，与 employees 表 (shop_id, lower(name)) 唯一约束对齐
  updateRow(hash, [input.shopId, input.employeeName.toLowerCase(), input.workDate])
  for (const item of input.items) {
    updateRow(hash, [item.sku, item.platform, item.name, item.url, item.spec, item.price])
  }
  return hash.digest('hex')
}
