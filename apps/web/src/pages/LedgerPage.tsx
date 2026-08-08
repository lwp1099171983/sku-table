import { DeleteOutlined, DownloadOutlined, HistoryOutlined, InboxOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Empty, Input, Modal, Pagination, Popconfirm, Progress, Space, Table, Typography, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile, UploadProps } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LedgerBatch, LedgerItem, LedgerStats } from '@sku-table/shared'
import { APP_LABELS } from '../constants/app'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useRecordDeletion } from '../hooks/useRecordDeletion'
import { useAuth } from '../layouts/AuthContext'
import { ledgerService } from '../services/ledgerService'
import { downloadTemplate, templateFiles } from '../services/templateService'
import './LedgerPage.css'

const DEFAULT_PAGE_SIZE = 30
const PAGE_SIZE_OPTIONS = [30, 50, 100]
const KEYWORD_DEBOUNCE_MS = 300

const EMPTY_STATS: LedgerStats = {
  purchaseAmount: 0,
  revenue: 0,
  grossProfit: 0,
  freight: 0,
  commission: 0,
  netProfit: 0,
  withdrawalFee: 0,
  pureProfit: 0,
}

function formatAmount(value: number) {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function renderText(value: string | null) {
  return value || '—'
}

export function LedgerPage() {
  const { canImportLedger, canDeleteLedger, canViewLedgerStats, currentShop } = useAuth()
  const { message } = AntdApp.useApp()
  const [file, setFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [filterMonth, setFilterMonth] = useState('')
  const [filterKeyword, setFilterKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(filterKeyword, KEYWORD_DEBOUNCE_MS)
  const [items, setItems] = useState<LedgerItem[]>([])
  const [stats, setStats] = useState<LedgerStats>(EMPTY_STATS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)
  const [batches, setBatches] = useState<LedgerBatch[]>([])
  const [batchPage, setBatchPage] = useState(1)
  const [batchPageSize, setBatchPageSize] = useState(20)
  const [batchTotal, setBatchTotal] = useState(0)
  const [batchesLoading, setBatchesLoading] = useState(false)

  const shopId = currentShop?.id ?? null

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const result = await ledgerService.list({
        page,
        pageSize,
        shopId,
        month: filterMonth.trim() || undefined,
        keyword: debouncedKeyword.trim() || undefined,
      })
      setItems(result.items)
      setStats(result.stats ?? EMPTY_STATS)
      setTotal(result.total)
    } catch {
      message.error('台账数据加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [debouncedKeyword, filterMonth, message, page, pageSize, shopId])

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true)
    try {
      const result = await ledgerService.listBatches({ page: batchPage, pageSize: batchPageSize, shopId })
      setBatches(result.items)
      setBatchTotal(result.total)
    } catch {
      message.error('导入批次加载失败，请稍后重试。')
    } finally {
      setBatchesLoading(false)
    }
  }, [batchPage, batchPageSize, message, shopId])

  useEffect(() => { void loadItems() }, [loadItems])
  useEffect(() => { if (isBatchModalOpen) void loadBatches() }, [isBatchModalOpen, loadBatches])

  const { selectedRowKeys, setSelectedRowKeys, isDeleting, handleDelete, confirmDelete } = useRecordDeletion({
    deleteItem: ledgerService.deleteItem,
    batchDelete: ledgerService.batchDelete,
    shopId,
    onDeleted: loadItems,
  })

  const uploadProps: UploadProps = {
    accept: '.xlsx,.xls',
    maxCount: 1,
    beforeUpload: (selectedFile) => {
      setFile(selectedFile)
      setUploadProgress(0)
      return false
    },
    onRemove: () => setFile(null),
    fileList: file ? [{ uid: '-1', name: file.name, status: 'done' } as UploadFile] : [],
  }

  async function handleUpload() {
    if (!file) {
      message.error('请选择 Excel 文件。')
      return
    }

    setIsUploading(true)
    try {
      const result = await ledgerService.importFile({
        file,
        onProgress: setUploadProgress,
      })
      if (result.reused) {
        message.info(`该文件此前已导入过（${result.importedRows.toLocaleString()} 行），未重复入库。`)
      } else {
        message.success(`已导入 ${result.importedRows.toLocaleString()} 行台账数据（${result.batches.length} 个店铺）。`)
      }
      setFile(null)
      setIsImportModalOpen(false)
      setPage(1)
      await loadItems()
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      const errorMessage = apiMessage || '导入失败，请检查文件格式后重试。'
      message.error(errorMessage)
    } finally {
      setIsUploading(false)
    }
  }

  const statCards: Array<{ label: string; value: number; highlight?: boolean }> = [
    { label: '采购金额', value: stats.purchaseAmount },
    { label: '营业额', value: stats.revenue, highlight: true },
    { label: '毛利润', value: stats.grossProfit, highlight: true },
    { label: '运费', value: stats.freight },
    { label: '抽点', value: stats.commission },
    { label: '净利润', value: stats.netProfit, highlight: true },
    { label: '提现费用', value: stats.withdrawalFee },
    { label: '纯利润', value: stats.pureProfit, highlight: true },
  ]

  const columns: ColumnsType<LedgerItem> = useMemo(() => {
    const base: ColumnsType<LedgerItem> = []
    if (currentShop === null) {
      base.push({ title: '店铺', dataIndex: 'shopName', key: 'shopName', width: 120, fixed: 'left' })
    }
    base.push(
      // 自动序号：按当前列表顺序全局连续编号（跨分页累计），不受 Excel 原始序号影响
      { title: '序号', key: 'seq', width: 64, render: (_, __, index: number) => (page - 1) * pageSize + index + 1 },
      { title: '月份', dataIndex: 'month', key: 'month', width: 70, render: renderText },
      { title: '订单日期', dataIndex: 'orderDate', key: 'orderDate', width: 160, render: renderText },
      { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 170, render: renderText },
      { title: '跟踪号', dataIndex: 'trackingNo', key: 'trackingNo', width: 170, render: renderText },
      { title: '售价', dataIndex: 'salePrice', key: 'salePrice', width: 90, align: 'right' as const, render: renderText },
      { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70, align: 'right' as const, render: renderText },
      { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const, render: renderText },
      { title: '采购金额', dataIndex: 'purchaseAmount', key: 'purchaseAmount', width: 100, align: 'right' as const, render: renderText },
      { title: '采购日期', dataIndex: 'purchaseDate', key: 'purchaseDate', width: 110, render: renderText },
      { title: '采购平台', dataIndex: 'purchasePlatform', key: 'purchasePlatform', width: 110, render: renderText },
      { title: '采购订单号', dataIndex: 'purchaseOrderNo', key: 'purchaseOrderNo', width: 170, render: renderText },
      { title: '毛利', dataIndex: 'grossProfit', key: 'grossProfit', width: 90, align: 'right' as const, render: renderText },
      { title: '渠道名称', dataIndex: 'channelName', key: 'channelName', width: 200, ellipsis: true, render: renderText },
      { title: '包裹重量', dataIndex: 'packageWeight', key: 'packageWeight', width: 90, align: 'right' as const, render: renderText },
      { title: '运费', dataIndex: 'freight', key: 'freight', width: 90, align: 'right' as const, render: renderText },
      { title: '抽点', dataIndex: 'commission', key: 'commission', width: 90, align: 'right' as const, render: renderText },
      { title: '净利', dataIndex: 'netProfit', key: 'netProfit', width: 90, align: 'right' as const, render: renderText },
      { title: '广告22%', dataIndex: 'ad22', key: 'ad22', width: 90, align: 'right' as const, render: renderText },
      { title: '22%净利', dataIndex: 'ad22Net', key: 'ad22Net', width: 90, align: 'right' as const, render: renderText },
      { title: '广告30%', dataIndex: 'ad30', key: 'ad30', width: 90, align: 'right' as const, render: renderText },
      { title: '30%净利', dataIndex: 'ad30Net', key: 'ad30Net', width: 90, align: 'right' as const, render: renderText },
      { title: '赔偿', dataIndex: 'compensation', key: 'compensation', width: 90, align: 'right' as const, render: renderText },
      { title: '备注', dataIndex: 'remark', key: 'remark', width: 160, ellipsis: true, render: renderText },
    )
    if (canDeleteLedger) {
      base.push({
        title: '操作',
        key: 'action',
        width: 80,
        fixed: 'right',
        render: (_, record) => (
          <Popconfirm
            title="确认删除这条记录？"
            description="删除后不可恢复。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => handleDelete([record.id])}
          >
            <Button type="text" danger icon={<DeleteOutlined />} aria-label="删除记录" />
          </Popconfirm>
        ),
      })
    }
    return base
  }, [canDeleteLedger, currentShop, page, pageSize])

  const rowSelection = canDeleteLedger ? {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  } : undefined

  const batchColumns: ColumnsType<LedgerBatch> = [
    { title: '店铺', dataIndex: 'shopName', key: 'shopName', width: 140 },
    { title: '文件名', dataIndex: 'fileName', key: 'fileName', ellipsis: true },
    { title: '行数', dataIndex: 'totalRows', key: 'totalRows', width: 80, align: 'right' as const, render: (value: number) => value.toLocaleString() },
    { title: '导入时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false }) },
  ]

  function resetFilters() {
    setFilterMonth('')
    setFilterKeyword('')
    setPage(1)
  }

  function handlePageChange(nextPage: number, nextPageSize: number) {
    if (nextPageSize !== pageSize) {
      setPageSize(nextPageSize)
      setPage(1)
      return
    }
    setPage(nextPage)
  }

  return (
    <section className="content-page">
      <div className="page-heading">
        <div>
          <Typography.Text className="eyebrow">ORDER LEDGER</Typography.Text>
          <Typography.Title level={1}>{APP_LABELS.ledger}</Typography.Title>
          <Typography.Paragraph type="secondary">订单统计表，Excel 导入保存原始值{canViewLedgerStats ? '，顶部统计随筛选结果实时汇总' : ''}。</Typography.Paragraph>
        </div>
        <Space className="page-actions">
          {canImportLedger && <Button type="primary" icon={<UploadOutlined />} onClick={() => setIsImportModalOpen(true)}>导入台账</Button>}
          <Button icon={<HistoryOutlined />} onClick={() => setIsBatchModalOpen(true)}>导入记录</Button>
          <Button icon={<DownloadOutlined />} onClick={() => downloadTemplate(templateFiles.ledger, '台账模板.xlsx')}>下载模板</Button>
          <Button icon={<ReloadOutlined />} onClick={() => void loadItems()}>刷新</Button>
        </Space>
      </div>

      {canImportLedger && <Modal
        title="导入台账数据"
        open={isImportModalOpen}
        width={720}
        footer={null}
        maskClosable={!isUploading}
        keyboard={!isUploading}
        onCancel={() => { if (!isUploading) { setFile(null); setIsImportModalOpen(false) } }}
      >
        <Typography.Paragraph type="secondary">上传订单统计表 Excel（25 个字段，含跟踪号），系统按"店铺"列自动归类；不存在的店铺会自动创建。</Typography.Paragraph>
        <Alert type="info" showIcon message="支持 .xlsx / .xls；表头需包含：店铺、订单号、售价、采购金额 等 25 个字段；单批最多 5 万行；毛利/净利/广告等公式列不重算，原样保存。" />
        <div className="ledger-upload-block">
          <Upload.Dragger {...uploadProps} disabled={isUploading}>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽台账 Excel 到这里</p>
            <p className="ant-upload-hint">文件名会记录到导入批次中</p>
          </Upload.Dragger>
          <div className="import-submit-block">
            <Button type="primary" icon={<UploadOutlined />} loading={isUploading} onClick={() => void handleUpload()} className="import-submit">开始导入</Button>
          </div>
          {isUploading && <div className="progress-block"><Typography.Text>正在上传和写入数据...</Typography.Text><Progress percent={uploadProgress} status="active" /></div>}
        </div>
      </Modal>}

      <Modal
        title="导入记录"
        open={isBatchModalOpen}
        width={860}
        footer={null}
        onCancel={() => setIsBatchModalOpen(false)}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">按批次追溯台账导入来源（文件名、店铺、行数、导入时间）。</Typography.Paragraph>
        <Table
          rowKey="id"
          columns={batchColumns}
          dataSource={batches}
          loading={batchesLoading}
          size="small"
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无导入批次" /> }}
          pagination={{
            current: batchPage,
            pageSize: batchPageSize,
            total: batchTotal,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (count) => `共 ${count.toLocaleString()} 个批次`,
            onChange: (nextPage, nextPageSize) => {
              if (nextPageSize !== batchPageSize) {
                setBatchPageSize(nextPageSize)
                setBatchPage(1)
                return
              }
              setBatchPage(nextPage)
            },
          }}
        />
      </Modal>

      {canViewLedgerStats && <div className="stats-grid">
        {statCards.map((card) => (
          <div className={`stat-card${card.highlight ? ' stat-card-highlight' : ''}`} key={card.label}>
            <Typography.Text type="secondary" className="stat-label">{card.label}</Typography.Text>
            <Typography.Title level={4} className="stat-value">¥ {formatAmount(card.value)}</Typography.Title>
          </div>
        ))}
      </div>}

      <div className="records-section">
        <div className="section-heading">
          <div><Typography.Title level={4}>台账明细</Typography.Title><Typography.Text type="secondary">共 {total.toLocaleString()} 条记录{canViewLedgerStats ? '（统计随筛选变化）' : ''}</Typography.Text></div>
          {canDeleteLedger && selectedRowKeys.length > 0 && (
            <Button danger icon={<DeleteOutlined />} loading={isDeleting} onClick={() => confirmDelete(selectedRowKeys.map(Number), `确认删除选中的 ${selectedRowKeys.length} 条台账记录？`, '删除后不可恢复，同时会扣减对应导入批次的记录数，顶部统计会同步变化。')}>
              批量删除（{selectedRowKeys.length}）
            </Button>
          )}
        </div>
        <div className="filter-bar ledger-filter-bar">
          <Space size="middle" wrap>
            <Input className="ledger-month-input" prefix={<SearchOutlined />} allowClear placeholder="月份，如 10" value={filterMonth} onChange={(event) => { setFilterMonth(event.target.value); setPage(1) }} />
            <Input className="ledger-keyword-input" prefix={<SearchOutlined />} allowClear placeholder="订单号 / 采购订单号" value={filterKeyword} onChange={(event) => { setFilterKeyword(event.target.value); setPage(1) }} />
            <Button onClick={resetFilters}>清除筛选</Button>
          </Space>
        </div>
        <div className="table-wrap">
          <Table rowKey="id" columns={columns} dataSource={items} loading={loading} rowSelection={rowSelection} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂时没有台账数据" /> }} scroll={{ x: 2800 }} pagination={false} />
          {total > 0 && <div className="table-pagination"><Pagination current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={PAGE_SIZE_OPTIONS} showQuickJumper showTotal={(count) => `共 ${count.toLocaleString()} 条`} onChange={handlePageChange} /></div>}
        </div>
      </div>
    </section>
  )
}
