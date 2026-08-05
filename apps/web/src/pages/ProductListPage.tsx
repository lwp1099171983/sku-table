import { CheckOutlined, EditOutlined, FilterOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Empty, Input, Select, Space, Spin, Table, Tag, Tooltip, Typography, message } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppUser, Product } from '@sku-table/shared'
import { productService } from '../services/productService'
import { userService } from '../services/userService'
import './ProductListPage.css'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function ProductListPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [members, setMembers] = useState<AppUser[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedUploader, setSelectedUploader] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftNote, setDraftNote] = useState('')

  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const result = await productService.list({ page, pageSize: 100, createdBy: selectedUploader })
      setProducts(result.items)
      setTotal(result.total)
    } catch {
      message.error('商品列表加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [page, selectedUploader])

  useEffect(() => { void loadProducts() }, [loadProducts])
  useEffect(() => {
    userService.listActiveMembers().then(setMembers).catch(() => message.error('团队成员加载失败。'))
  }, [])

  async function saveNote(product: Product) {
    setSavingId(product.id)
    try {
      await productService.updateInternalNote(product.id, { internalNote: draftNote })
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, internalNote: draftNote } : item))
      setEditingId(null)
      message.success('备注已保存')
    } catch {
      message.error('备注保存失败，页面已保留服务端数据。')
      await loadProducts()
    } finally {
      setSavingId(null)
    }
  }

  const columns: ColumnsType<Product> = useMemo(() => [
    { title: '商品', dataIndex: 'name', key: 'name', width: 260, fixed: 'left', render: (value: string, item) => <div><Typography.Text strong>{value}</Typography.Text><div className="table-subtext">{item.sku || '暂无货号'}</div></div> },
    { title: '平台', dataIndex: 'platform', key: 'platform', width: 100, render: (value: string | null) => value ? <Tag bordered={false} color="blue">{value}</Tag> : <Typography.Text type="secondary">未填写</Typography.Text> },
    { title: '价格', dataIndex: 'price', key: 'price', width: 110, render: (value: string | null) => value ? <span className="price-cell">¥ {value}</span> : '—' },
    { title: '规格', dataIndex: 'spec', key: 'spec', width: 180, ellipsis: true, render: (value: string | null) => value || '—' },
    { title: '上传人', key: 'uploader', width: 150, render: (_, item) => <div><span>{item.uploader?.displayName || item.uploader?.email || '未知成员'}</span><div className="table-subtext">{formatDate(item.createdAt)}</div></div> },
    { title: '内部备注', dataIndex: 'internalNote', key: 'internalNote', width: 310, render: (value: string | null, item) => editingId === item.id ? <Space.Compact block><Input value={draftNote} onChange={(event) => setDraftNote(event.target.value)} onPressEnter={() => void saveNote(item)} autoFocus /><Button type="primary" icon={<CheckOutlined />} loading={savingId === item.id} onClick={() => void saveNote(item)} aria-label="保存备注" /></Space.Compact> : <div className="note-cell" onClick={() => { setEditingId(item.id); setDraftNote(value ?? '') }}><span className={value ? '' : 'empty-note'}>{value || '点击添加备注'}</span><EditOutlined className="note-edit-icon" /></div> },
  ], [draftNote, editingId, loadProducts, savingId])

  function handleTableChange(pagination: TablePaginationConfig) {
    setPage(pagination.current ?? 1)
  }

  return (
    <section className="content-page">
      <div className="page-heading">
        <div><Typography.Text className="eyebrow">PRODUCT LIBRARY</Typography.Text><Typography.Title level={1}>商品库</Typography.Title><Typography.Paragraph type="secondary">查看团队选品，快速更新跟进备注。</Typography.Paragraph></div>
        <Button icon={<ReloadOutlined />} onClick={() => void loadProducts}>刷新</Button>
      </div>
      <div className="filter-bar">
        <Space size="middle" wrap>
          <Typography.Text strong><FilterOutlined /> 筛选</Typography.Text>
          <Select className="product-uploader-filter" allowClear placeholder="全部上传人" value={selectedUploader} onChange={(value) => { setSelectedUploader(value); setPage(1) }} options={members.map((member) => ({ value: member.id, label: member.displayName || member.email }))} />
          <Input className="product-search-input" prefix={<SearchOutlined />} placeholder="v1.1 支持货号 / 名称搜索" disabled />
        </Space>
        <Typography.Text type="secondary">共 {total.toLocaleString()} 条商品</Typography.Text>
      </div>
      <div className="table-wrap">
        <Table rowKey="id" columns={columns} dataSource={products} loading={{ indicator: <Spin />, spinning: loading }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂时没有商品数据" /> }} scroll={{ x: 1160 }} pagination={{ current: page, pageSize: 100, total, showSizeChanger: false, showQuickJumper: true, showTotal: (count) => `共 ${count.toLocaleString()} 条` }} onChange={handleTableChange} />
      </div>
    </section>
  )
}
