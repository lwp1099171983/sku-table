import { App as AntdApp } from 'antd'
import { useState } from 'react'

// 单行/批量删除的通用逻辑：二次确认、删除后刷新、统一错误提示（员工工作与台账共用）
export function useRecordDeletion(options: {
  deleteItem: (id: number, shopId?: string | null) => Promise<{ deleted: number }>
  batchDelete: (ids: number[], shopId?: string | null) => Promise<{ deleted: number }>
  shopId?: string | null
  onDeleted: () => Promise<void>
}) {
  const { message, modal } = AntdApp.useApp()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete(ids: number[]) {
    setIsDeleting(true)
    try {
      const result = ids.length === 1
        ? await options.deleteItem(ids[0], options.shopId)
        : await options.batchDelete(ids, options.shopId)
      message.success(`已删除 ${result.deleted.toLocaleString()} 条记录。`)
      setSelectedRowKeys([])
      await options.onDeleted()
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '删除失败，请稍后重试。')
    } finally {
      setIsDeleting(false)
    }
  }

  function confirmDelete(ids: number[], title: string, content: string) {
    modal.confirm({
      title,
      content,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => handleDelete(ids),
    })
  }

  return { selectedRowKeys, setSelectedRowKeys, isDeleting, handleDelete, confirmDelete }
}
