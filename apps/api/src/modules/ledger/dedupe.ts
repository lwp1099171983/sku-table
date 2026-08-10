import type { ParsedLedgerItem } from './parser.js'

// 非空订单号全局区分大小写去重；空订单号保留。
export function dedupeLedgerItemsByOrderNo(items: ParsedLedgerItem[]) {
  const seenOrderNos = new Set<string>()
  const uniqueItems: ParsedLedgerItem[] = []
  let skippedRows = 0

  for (const item of items) {
    if (item.orderNo) {
      if (seenOrderNos.has(item.orderNo)) {
        skippedRows += 1
        continue
      }
      seenOrderNos.add(item.orderNo)
    }
    uniqueItems.push(item)
  }

  return { items: uniqueItems, skippedRows }
}
