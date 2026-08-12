import type { ParsedLedgerItem } from './parser.js'

// 非空订单号全局区分大小写去重；同一文件重复时以最后一行作为最终更新值，空订单号全部保留。
export function dedupeLedgerItemsByOrderNo(items: ParsedLedgerItem[]) {
  const lastIndexes = new Map<string, number>()
  for (let index = 0; index < items.length; index += 1) {
    const orderNo = items[index].orderNo
    if (orderNo) lastIndexes.set(orderNo, index)
  }

  const uniqueItems = items.filter((item, index) => !item.orderNo || lastIndexes.get(item.orderNo) === index)

  return { items: uniqueItems, skippedRows: items.length - uniqueItems.length }
}
