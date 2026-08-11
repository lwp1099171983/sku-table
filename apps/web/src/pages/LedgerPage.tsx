import { CheckOutlined, CloseOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, HistoryOutlined, InboxOutlined, ReloadOutlined, SearchOutlined, UndoOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, DatePicker, Empty, Input, InputNumber, Modal, Pagination, Popconfirm, Progress, Segmented, Space, Table, Tooltip, Typography, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile, UploadProps } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
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
type MonthRangeValue = [Dayjs | null, Dayjs | null] | null

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

function renderAmount(value: string | null) {
  if (!value) return '—'
  const normalized = value.replace(/[￥¥,，\s]/g, '')
  if (!normalized) return value
  const amount = Number(normalized)
  return Number.isFinite(amount) ? formatAmount(amount) : value
}

function getCurrentYearMonthRange(): MonthRangeValue {
  const now = dayjs()
  return [now.startOf('year'), now.startOf('month')]
}

function EditableWeightCell({ record, onSaved }: { record: LedgerItem; onSaved: (item: LedgerItem) => Promise<void> }) {
  const { message } = AntdApp.useApp()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [value, setValue] = useState<number | null>(null)

  function startEditing() {
    const current = Number(record.packageWeight)
    setValue(Number.isFinite(current) ? current : null)
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
    setValue(null)
  }

  async function saveWeight() {
    if (value === null || !Number.isFinite(value) || value < 0) {
      message.error('请输入大于等于 0 的包裹重量。')
      return
    }
    setIsSaving(true)
    try {
      const result = await ledgerService.updateWeight(record.id, value)
      await onSaved(result.item)
      setIsEditing(false)
      message.success('重量及相关数据已重新计算。')
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '重量保存失败，请稍后重试。')
    } finally {
      setIsSaving(false)
    }
  }

  if (isEditing) {
    return (
      <div className="ledger-weight-editor">
        <InputNumber
          aria-label="包裹重量（克）"
          min={0}
          precision={3}
          value={value}
          onChange={setValue}
          onKeyDown={(event) => { if (event.key === 'Enter') void saveWeight() }}
        />
        <Tooltip title="保存">
          <Button type="text" size="small" icon={<CheckOutlined />} loading={isSaving} onClick={() => void saveWeight()} aria-label="保存重量" />
        </Tooltip>
        <Tooltip title="取消">
          <Button type="text" size="small" icon={<CloseOutlined />} disabled={isSaving} onClick={cancelEditing} aria-label="取消编辑重量" />
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="ledger-weight-display">
      <span>{renderText(record.packageWeight)}</span>
      <Tooltip title="编辑重量">
        <Button type="text" size="small" icon={<EditOutlined />} onClick={startEditing} aria-label="编辑包裹重量" />
      </Tooltip>
    </div>
  )
}

export function LedgerPage() {
  const { canImportLedger, canEditLedger, canDeleteLedger, canViewLedgerStats, currentShop, isAdmin } = useAuth()
  const { message } = AntdApp.useApp()
  const [file, setFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [filterMonthRange, setFilterMonthRange] = useState<MonthRangeValue>(getCurrentYearMonthRange)
  const [filterKeyword, setFilterKeyword] = useState('')
  const [viewStatus, setViewStatus] = useState<'active' | 'deleted'>('active')
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
  const isDeletedView = viewStatus === 'deleted'

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const result = await ledgerService.list({
        page,
        pageSize,
        shopId,
        startMonth: filterMonthRange?.[0]?.format('YYYY-MM'),
        endMonth: filterMonthRange?.[1]?.format('YYYY-MM'),
        keyword: debouncedKeyword.trim() || undefined,
        status: viewStatus,
      })
      setItems(result.items)
      setStats(result.stats ?? EMPTY_STATS)
      setTotal(result.total)
    } catch {
      message.error('台账数据加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [debouncedKeyword, filterMonthRange, message, page, pageSize, shopId, viewStatus])

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
    successMessage: (count) => `已将 ${count.toLocaleString()} 条台账移入回收站。`,
    errorMessage: '移入回收站失败，请稍后重试。',
    confirmText: '移入回收站',
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
        message.info(`该文件此前已处理过，本次跳过 ${result.skippedRows.toLocaleString()} 行。`)
      } else if (result.skippedRows > 0) {
        message.warning(`已导入 ${result.importedRows.toLocaleString()} 行，跳过 ${result.skippedRows.toLocaleString()} 行重复订单号。`)
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

  const handleWeightSaved = useCallback(async (updatedItem: LedgerItem) => {
    setItems((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item))
    await loadItems()
  }, [loadItems])

  const [restoringId, setRestoringId] = useState<number | null>(null)
  const handleRestore = useCallback(async (id: number) => {
    setRestoringId(id)
    try {
      await ledgerService.restoreItem(id)
      message.success('台账已恢复。')
      await loadItems()
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '恢复台账失败，请稍后重试。')
    } finally {
      setRestoringId(null)
    }
  }, [loadItems, message])

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
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 170, render: renderText },
      { title: '售价', dataIndex: 'salePrice', key: 'salePrice', width: 90, align: 'right' as const, render: renderAmount },
      { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70, align: 'right' as const, render: renderText },
      { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const, render: renderAmount },
      { title: '采购金额', dataIndex: 'purchaseAmount', key: 'purchaseAmount', width: 100, align: 'right' as const, render: renderAmount },
      { title: '采购日期', dataIndex: 'purchaseDate', key: 'purchaseDate', width: 110, render: renderText },
      { title: '采购平台', dataIndex: 'purchasePlatform', key: 'purchasePlatform', width: 110, render: renderText },
      { title: '采购订单号', dataIndex: 'purchaseOrderNo', key: 'purchaseOrderNo', width: 170, render: renderText },
      { title: '毛利', dataIndex: 'grossProfit', key: 'grossProfit', width: 90, align: 'right' as const, render: renderAmount },
      { title: '渠道名称', dataIndex: 'channelName', key: 'channelName', width: 200, ellipsis: true, render: renderText },
      {
        title: '包裹重量',
        dataIndex: 'packageWeight',
        key: 'packageWeight',
        width: canEditLedger && !isDeletedView ? 166 : 100,
        align: 'right' as const,
        render: (_, record) => canEditLedger && !isDeletedView
          ? <EditableWeightCell record={record} onSaved={handleWeightSaved} />
          : renderText(record.packageWeight),
      },
      { title: '运费', dataIndex: 'freight', key: 'freight', width: 90, align: 'right' as const, render: renderAmount },
      { title: '抽点', dataIndex: 'commission', key: 'commission', width: 90, align: 'right' as const, render: renderAmount },
      { title: '净利', dataIndex: 'netProfit', key: 'netProfit', width: 90, align: 'right' as const, render: renderAmount },
      { title: '广告22%', dataIndex: 'ad22', key: 'ad22', width: 90, align: 'right' as const, render: renderAmount },
      { title: '22%净利', dataIndex: 'ad22Net', key: 'ad22Net', width: 90, align: 'right' as const, render: renderAmount },
      { title: '广告30%', dataIndex: 'ad30', key: 'ad30', width: 90, align: 'right' as const, render: renderAmount },
      { title: '30%净利', dataIndex: 'ad30Net', key: 'ad30Net', width: 90, align: 'right' as const, render: renderAmount },
      { title: '尾程', dataIndex: 'tailFee', key: 'tailFee', width: 90, align: 'right' as const, render: renderText },
      { title: '备注', dataIndex: 'remark', key: 'remark', width: 160, ellipsis: true, render: renderText },
    )
    if (isDeletedView) {
      base.push(
        { title: '删除时间', dataIndex: 'deletedAt', key: 'deletedAt', width: 180, render: (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—' },
        {
          title: '操作',
          key: 'action',
          width: 80,
          fixed: 'right',
          render: (_, record) => (
            <Popconfirm
              title="确认恢复这条台账？"
              description="恢复后将重新参与台账列表、统计和所属导入批次行数。"
              okText="恢复"
              cancelText="取消"
              onConfirm={() => void handleRestore(record.id)}
            >
              <Tooltip title="恢复台账"><Button type="text" icon={<UndoOutlined />} loading={restoringId === record.id} aria-label="恢复台账" /></Tooltip>
            </Popconfirm>
          ),
        },
      )
    } else if (canDeleteLedger) {
      base.push({
        title: '操作',
        key: 'action',
        width: 80,
        fixed: 'right',
        render: (_, record) => (
          <Popconfirm
            title="确认移入回收站？"
            description="移入后不参与台账列表、统计和所属导入批次行数，管理员可恢复。"
            okText="移入回收站"
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
  }, [canDeleteLedger, canEditLedger, currentShop, handleDelete, handleRestore, handleWeightSaved, isDeletedView, page, pageSize, restoringId])

  const rowSelection = canDeleteLedger && !isDeletedView ? {
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
    setFilterMonthRange(null)
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
        <Typography.Paragraph type="secondary">上传订单统计表 Excel（25 个字段，含 SKU），系统按"店铺"列自动归类；不存在的店铺会自动创建。</Typography.Paragraph>
        <Alert type="info" showIcon message="支持 .xlsx / .xls；订单号全系统唯一，重复行自动跳过；单批最多 5 万行；导入时公式列按 Excel 保存值入库，在线修改重量时重新计算。" />
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

      {canViewLedgerStats && !isDeletedView && <div className="stats-grid">
        {statCards.map((card) => (
          <div className={`stat-card${card.highlight ? ' stat-card-highlight' : ''}`} key={card.label}>
            <Typography.Text type="secondary" className="stat-label">{card.label}</Typography.Text>
            <Typography.Title level={4} className="stat-value">¥ {formatAmount(card.value)}</Typography.Title>
          </div>
        ))}
      </div>}

      <div className="records-section">
        <div className="section-heading">
          <div><Typography.Title level={4}>{isDeletedView ? '台账回收站' : '台账明细'}</Typography.Title><Typography.Text type="secondary">共 {total.toLocaleString()} 条记录{canViewLedgerStats && !isDeletedView ? '（统计随筛选变化）' : ''}</Typography.Text></div>
          {canDeleteLedger && !isDeletedView && selectedRowKeys.length > 0 && (
            <Button danger icon={<DeleteOutlined />} loading={isDeleting} onClick={() => confirmDelete(selectedRowKeys.map(Number), `确认移入回收站选中的 ${selectedRowKeys.length} 条台账记录？`, '移入后不参与台账列表、统计和所属导入批次行数，管理员可恢复。')}>
              移入回收站（{selectedRowKeys.length}）
            </Button>
          )}
        </div>
        <div className="filter-bar ledger-filter-bar">
          <Space size="middle" wrap>
            {isAdmin && <Segmented
              value={viewStatus}
              options={[{ label: '当前台账', value: 'active' }, { label: '回收站', value: 'deleted' }]}
              onChange={(value) => {
                setViewStatus(value as 'active' | 'deleted')
                setPage(1)
                setSelectedRowKeys([])
              }}
            />}
            <DatePicker.RangePicker
              className="ledger-month-range-picker"
              picker="month"
              format="YYYY年M月"
              placeholder={['开始月份', '结束月份']}
              allowClear
              value={filterMonthRange}
              onChange={(value) => { setFilterMonthRange(value); setPage(1) }}
            />
            <Input className="ledger-keyword-input" prefix={<SearchOutlined />} allowClear placeholder="订单号 / 采购订单号" value={filterKeyword} onChange={(event) => { setFilterKeyword(event.target.value); setPage(1) }} />
            <Button onClick={resetFilters}>清除筛选</Button>
          </Space>
        </div>
        <div className="table-wrap">
          <Table rowKey="id" columns={columns} dataSource={items} loading={loading} rowSelection={rowSelection} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂时没有台账数据" /> }} scroll={{ x: 2880 }} pagination={false} />
          {total > 0 && <div className="table-pagination"><Pagination current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={PAGE_SIZE_OPTIONS} showQuickJumper showTotal={(count) => `共 ${count.toLocaleString()} 条`} onChange={handlePageChange} /></div>}
        </div>
      </div>
    </section>
  )
}
