import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, HistoryOutlined, InboxOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, DatePicker, Empty, Input, InputNumber, Modal, Pagination, Popconfirm, Progress, Space, Table, Tooltip, Typography, Upload } from 'antd'
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
import './LedgerPage.css'

const DEFAULT_PAGE_SIZE = 30
const PAGE_SIZE_OPTIONS = [30, 50, 100]
const FILTER_INPUT_DEBOUNCE_MS = 300
type MonthRangeValue = [Dayjs | null, Dayjs | null] | null
type AmountBoundaryValue = string | null

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

function parseFiniteAmount(value: string | null) {
  if (!value) return null
  const amount = Number(value.replace(/[￥¥,，\s]/g, ''))
  return Number.isFinite(amount) ? amount : null
}

function EllipsisCell({ text, className }: { text: string; className?: string }) {
  const content = <span className={`ledger-ellipsis-cell${className ? ` ${className}` : ''}`}>{text}</span>
  // 省略由表格单元格控制，始终绑定 Tooltip，确保截断后的完整值可查看。
  return text === '—' ? content : <Tooltip title={text}>{content}</Tooltip>
}

function renderEllipsisText(value: string | null) {
  return <EllipsisCell text={renderText(value)} />
}

function renderEllipsisAmount(value: string | null) {
  return <EllipsisCell text={renderAmount(value)} />
}

function renderProfitAmount(value: string | null) {
  const amount = parseFiniteAmount(value)
  return <EllipsisCell text={renderAmount(value)} className={amount !== null && amount < 0 ? 'ledger-negative-profit' : undefined} />
}

function ProfitRangeFilter({
  label,
  minimum,
  maximum,
  onMinimumChange,
  onMaximumChange,
}: {
  label: string
  minimum: AmountBoundaryValue
  maximum: AmountBoundaryValue
  onMinimumChange: (value: AmountBoundaryValue) => void
  onMaximumChange: (value: AmountBoundaryValue) => void
}) {
  return (
    <div className="ledger-profit-range" aria-label={`${label}范围`}>
      <Typography.Text className="ledger-profit-range-label">{label}</Typography.Text>
      <InputNumber<string> aria-label={`${label}最低值`} controls={false} precision={2} stringMode placeholder="最低" value={minimum} onChange={onMinimumChange} />
      <span className="ledger-profit-range-separator">至</span>
      <InputNumber<string> aria-label={`${label}最高值`} controls={false} precision={2} stringMode placeholder="最高" value={maximum} onChange={onMaximumChange} />
    </div>
  )
}

function isAmountRangeInvalid(minimum: AmountBoundaryValue, maximum: AmountBoundaryValue) {
  const minimumAmount = minimum === null ? null : Number(minimum)
  const maximumAmount = maximum === null ? null : Number(maximum)
  return minimumAmount !== null && maximumAmount !== null && minimumAmount > maximumAmount
}

function toOptionalAmount(value: AmountBoundaryValue) {
  return value === null ? undefined : Number(value)
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

function EditablePurchaseAmountCell({ record, onSaved }: { record: LedgerItem; onSaved: (item: LedgerItem) => Promise<void> }) {
  const { message } = AntdApp.useApp()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [value, setValue] = useState<string | null>(null)

  function startEditing() {
    const current = record.purchaseAmount?.replace(/[￥¥,，\s]/g, '') ?? ''
    setValue(/^\d+(?:\.\d{1,2})?$/.test(current) ? current : null)
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
    setValue(null)
  }

  async function savePurchaseAmount() {
    if (value === null || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
      message.error('请输入大于等于 0 且最多两位小数的采购金额。')
      return
    }
    setIsSaving(true)
    try {
      const result = await ledgerService.updatePurchaseAmount(record.id, value)
      await onSaved(result.item)
      setIsEditing(false)
      message.success('采购金额及相关利润已重新计算。')
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '采购金额保存失败，请稍后重试。')
    } finally {
      setIsSaving(false)
    }
  }

  if (isEditing) {
    return (
      <div className="ledger-purchase-editor">
        <InputNumber<string>
          aria-label="采购金额"
          min="0"
          precision={2}
          stringMode
          value={value}
          onChange={setValue}
          onKeyDown={(event) => { if (event.key === 'Enter') void savePurchaseAmount() }}
        />
        <Tooltip title="保存">
          <Button type="text" size="small" icon={<CheckOutlined />} loading={isSaving} onClick={() => void savePurchaseAmount()} aria-label="保存采购金额" />
        </Tooltip>
        <Tooltip title="取消">
          <Button type="text" size="small" icon={<CloseOutlined />} disabled={isSaving} onClick={cancelEditing} aria-label="取消编辑采购金额" />
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="ledger-purchase-display">
      <span>{renderAmount(record.purchaseAmount)}</span>
      <Tooltip title="编辑采购金额">
        <Button type="text" size="small" icon={<EditOutlined />} onClick={startEditing} aria-label="编辑采购金额" />
      </Tooltip>
    </div>
  )
}

export function LedgerPage() {
  const { canImportLedger, canEditLedger, canDeleteLedger, canViewLedgerStats, currentShop } = useAuth()
  const { message } = AntdApp.useApp()
  const [file, setFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [filterMonthRange, setFilterMonthRange] = useState<MonthRangeValue>(getCurrentYearMonthRange)
  const [filterKeyword, setFilterKeyword] = useState('')
  const [filterSku, setFilterSku] = useState('')
  const [filterNetProfitMin, setFilterNetProfitMin] = useState<AmountBoundaryValue>(null)
  const [filterNetProfitMax, setFilterNetProfitMax] = useState<AmountBoundaryValue>(null)
  const [filterAd22NetMin, setFilterAd22NetMin] = useState<AmountBoundaryValue>(null)
  const [filterAd22NetMax, setFilterAd22NetMax] = useState<AmountBoundaryValue>(null)
  const [filterAd30NetMin, setFilterAd30NetMin] = useState<AmountBoundaryValue>(null)
  const [filterAd30NetMax, setFilterAd30NetMax] = useState<AmountBoundaryValue>(null)
  const debouncedKeyword = useDebouncedValue(filterKeyword, FILTER_INPUT_DEBOUNCE_MS)
  const debouncedSku = useDebouncedValue(filterSku, FILTER_INPUT_DEBOUNCE_MS)
  const debouncedNetProfitMin = useDebouncedValue(filterNetProfitMin, FILTER_INPUT_DEBOUNCE_MS)
  const debouncedNetProfitMax = useDebouncedValue(filterNetProfitMax, FILTER_INPUT_DEBOUNCE_MS)
  const debouncedAd22NetMin = useDebouncedValue(filterAd22NetMin, FILTER_INPUT_DEBOUNCE_MS)
  const debouncedAd22NetMax = useDebouncedValue(filterAd22NetMax, FILTER_INPUT_DEBOUNCE_MS)
  const debouncedAd30NetMin = useDebouncedValue(filterAd30NetMin, FILTER_INPUT_DEBOUNCE_MS)
  const debouncedAd30NetMax = useDebouncedValue(filterAd30NetMax, FILTER_INPUT_DEBOUNCE_MS)
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
  const isFilterInputPending = filterKeyword !== debouncedKeyword
    || filterSku !== debouncedSku
    || filterNetProfitMin !== debouncedNetProfitMin
    || filterNetProfitMax !== debouncedNetProfitMax
    || filterAd22NetMin !== debouncedAd22NetMin
    || filterAd22NetMax !== debouncedAd22NetMax
    || filterAd30NetMin !== debouncedAd30NetMin
    || filterAd30NetMax !== debouncedAd30NetMax
  const hasInvalidProfitRange = isAmountRangeInvalid(filterNetProfitMin, filterNetProfitMax)
    || isAmountRangeInvalid(filterAd22NetMin, filterAd22NetMax)
    || isAmountRangeInvalid(filterAd30NetMin, filterAd30NetMax)

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
        sku: debouncedSku.trim() || undefined,
        netProfitMin: toOptionalAmount(debouncedNetProfitMin),
        netProfitMax: toOptionalAmount(debouncedNetProfitMax),
        ad22NetMin: toOptionalAmount(debouncedAd22NetMin),
        ad22NetMax: toOptionalAmount(debouncedAd22NetMax),
        ad30NetMin: toOptionalAmount(debouncedAd30NetMin),
        ad30NetMax: toOptionalAmount(debouncedAd30NetMax),
      })
      setItems(result.items)
      setStats(result.stats ?? EMPTY_STATS)
      setTotal(result.total)
    } catch {
      message.error('台账数据加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [debouncedAd22NetMax, debouncedAd22NetMin, debouncedAd30NetMax, debouncedAd30NetMin, debouncedKeyword, debouncedNetProfitMax, debouncedNetProfitMin, debouncedSku, filterMonthRange, message, page, pageSize, shopId])

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

  useEffect(() => {
    if (!isFilterInputPending && !hasInvalidProfitRange) void loadItems()
  }, [hasInvalidProfitRange, isFilterInputPending, loadItems])
  useEffect(() => { if (isBatchModalOpen) void loadBatches() }, [isBatchModalOpen, loadBatches])

  const { selectedRowKeys, setSelectedRowKeys, isDeleting, handleDelete, confirmDelete } = useRecordDeletion({
    deleteItem: ledgerService.deleteItem,
    batchDelete: ledgerService.batchDelete,
    shopId,
    onDeleted: loadItems,
    successMessage: (count) => `已删除 ${count.toLocaleString()} 条台账。`,
    errorMessage: '删除台账失败，请稍后重试。',
    confirmText: '删除',
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
      const skippedText = result.skippedRows > 0 ? `，忽略文件内重复 ${result.skippedRows.toLocaleString()} 行` : ''
      message.success(`新增 ${result.importedRows.toLocaleString()} 行，更新 ${result.updatedRows.toLocaleString()} 行${skippedText}（${result.batches.length} 个店铺）。`)
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

  const handleItemSaved = useCallback(async (updatedItem: LedgerItem) => {
    setItems((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item))
    await loadItems()
  }, [loadItems])

  const columns: ColumnsType<LedgerItem> = useMemo(() => {
    const base: ColumnsType<LedgerItem> = []
    const ellipsis = { showTitle: false }
    if (currentShop === null) {
      base.push({ title: '店铺', dataIndex: 'shopName', key: 'shopName', width: 100, fixed: 'left', ellipsis, render: renderEllipsisText })
    }
    base.push(
      // 自动序号：按当前列表顺序全局连续编号（跨分页累计），不受 Excel 原始序号影响
      { title: '序号', key: 'seq', width: 64, render: (_, __, index: number) => (page - 1) * pageSize + index + 1 },
      { title: '订单日期', dataIndex: 'orderDate', key: 'orderDate', width: 160, ellipsis, render: renderEllipsisText },
      { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 170, ellipsis, render: renderEllipsisText },
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 85, ellipsis, render: renderEllipsisText },
      { title: '售价', dataIndex: 'salePrice', key: 'salePrice', width: 90, align: 'right' as const, ellipsis, render: renderEllipsisAmount },
      {
        title: '采购金额',
        dataIndex: 'purchaseAmount',
        key: 'purchaseAmount',
        width: canEditLedger ? 166 : 100,
        align: 'right' as const,
        ellipsis,
        render: (_, record) => canEditLedger
          ? <EditablePurchaseAmountCell record={record} onSaved={handleItemSaved} />
          : renderEllipsisAmount(record.purchaseAmount),
      },
      {
        title: '包裹重量',
        dataIndex: 'packageWeight',
        key: 'packageWeight',
        width: canEditLedger ? 166 : 100,
        align: 'right' as const,
        ellipsis,
        render: (_, record) => canEditLedger
          ? <EditableWeightCell record={record} onSaved={handleItemSaved} />
          : renderEllipsisText(record.packageWeight),
      },
      { title: '毛利', dataIndex: 'grossProfit', key: 'grossProfit', width: 90, align: 'right' as const, ellipsis, render: renderEllipsisAmount },
      { title: '渠道名称', dataIndex: 'channelName', key: 'channelName', width: 160, ellipsis, render: renderEllipsisText },
      { title: '运费', dataIndex: 'freight', key: 'freight', width: 90, align: 'right' as const, ellipsis, render: renderEllipsisAmount },
      { title: '抽点', dataIndex: 'commission', key: 'commission', width: 90, align: 'right' as const, ellipsis, render: renderEllipsisAmount },
      { title: '净利', dataIndex: 'netProfit', key: 'netProfit', width: 90, align: 'right' as const, ellipsis, render: renderProfitAmount },
      { title: '广告22%', dataIndex: 'ad22', key: 'ad22', width: 90, align: 'right' as const, ellipsis, render: renderEllipsisAmount },
      { title: '22%净利', dataIndex: 'ad22Net', key: 'ad22Net', width: 90, align: 'right' as const, ellipsis, render: renderProfitAmount },
      { title: '广告30%', dataIndex: 'ad30', key: 'ad30', width: 90, align: 'right' as const, ellipsis, render: renderEllipsisAmount },
      { title: '30%净利', dataIndex: 'ad30Net', key: 'ad30Net', width: 90, align: 'right' as const, ellipsis, render: renderProfitAmount },
      { title: '尾程', dataIndex: 'tailFee', key: 'tailFee', width: 90, align: 'right' as const, ellipsis, render: renderEllipsisText },
      { title: '备注', dataIndex: 'remark', key: 'remark', width: 160, ellipsis, render: renderEllipsisText },
    )
    if (canDeleteLedger) {
      base.push({
        title: '操作',
        key: 'action',
        width: 80,
        fixed: 'right',
        render: (_, record) => (
          <Popconfirm
            title="确认删除这条台账？"
            description="删除后不参与台账列表、统计和所属导入批次行数。"
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
  }, [canDeleteLedger, canEditLedger, currentShop, handleDelete, handleItemSaved, page, pageSize])

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
    setFilterMonthRange(getCurrentYearMonthRange())
    setFilterKeyword('')
    setFilterSku('')
    setFilterNetProfitMin(null)
    setFilterNetProfitMax(null)
    setFilterAd22NetMin(null)
    setFilterAd22NetMax(null)
    setFilterAd30NetMin(null)
    setFilterAd30NetMax(null)
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
    <section className="content-page data-table-page">
      <div className="page-heading">
        <div>
          <Typography.Text className="eyebrow">ORDER LEDGER</Typography.Text>
          <Typography.Title level={1}>{APP_LABELS.ledger}</Typography.Title>
          <Typography.Paragraph type="secondary">订单统计表，Excel 导入保存原始值{canViewLedgerStats ? '，顶部统计随筛选结果实时汇总' : ''}。</Typography.Paragraph>
        </div>
        <Space className="page-actions">
          {canImportLedger && <Button type="primary" icon={<UploadOutlined />} onClick={() => setIsImportModalOpen(true)}>导入台账</Button>}
          <Button icon={<HistoryOutlined />} onClick={() => setIsBatchModalOpen(true)}>导入记录</Button>
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
        <Typography.Paragraph type="secondary">上传完整订单统计表 Excel（25 个业务字段，含 SKU），系统按"店铺"列自动归类；不存在的店铺会自动创建。</Typography.Paragraph>
        <Alert type="info" showIcon message="支持 .xlsx / .xls；必须包含完整台账表头；已有订单号按 Excel 整行覆盖，空单元格会清空旧值，同一文件重复时最后一行生效；公式列保存 Excel 原值，在线编辑时才由系统重算。" />
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
            <Button danger icon={<DeleteOutlined />} loading={isDeleting} onClick={() => confirmDelete(selectedRowKeys.map(Number), `确认删除选中的 ${selectedRowKeys.length} 条台账记录？`, '删除后不参与台账列表、统计和所属导入批次行数。')}>
              删除（{selectedRowKeys.length}）
            </Button>
          )}
        </div>
        <div className="filter-bar ledger-filter-bar">
          <Space size="middle" wrap>
            <DatePicker.RangePicker
              className="ledger-month-range-picker"
              picker="month"
              format="YYYY年M月"
              placeholder={['开始月份', '结束月份']}
              allowClear
              value={filterMonthRange}
              onChange={(value) => { setFilterMonthRange(value); setPage(1) }}
            />
            <Input className="ledger-filter-input" prefix={<SearchOutlined />} allowClear placeholder="订单号 / 采购订单号" value={filterKeyword} onChange={(event) => { setFilterKeyword(event.target.value); setPage(1) }} />
            <Input className="ledger-filter-input" prefix={<SearchOutlined />} allowClear placeholder="SKU" value={filterSku} onChange={(event) => { setFilterSku(event.target.value); setPage(1) }} />
            <ProfitRangeFilter label="净利" minimum={filterNetProfitMin} maximum={filterNetProfitMax} onMinimumChange={(value) => { setFilterNetProfitMin(value); setPage(1) }} onMaximumChange={(value) => { setFilterNetProfitMax(value); setPage(1) }} />
            <ProfitRangeFilter label="22%广告净利" minimum={filterAd22NetMin} maximum={filterAd22NetMax} onMinimumChange={(value) => { setFilterAd22NetMin(value); setPage(1) }} onMaximumChange={(value) => { setFilterAd22NetMax(value); setPage(1) }} />
            <ProfitRangeFilter label="30%广告净利" minimum={filterAd30NetMin} maximum={filterAd30NetMax} onMinimumChange={(value) => { setFilterAd30NetMin(value); setPage(1) }} onMaximumChange={(value) => { setFilterAd30NetMax(value); setPage(1) }} />
            <Button onClick={resetFilters}>清除筛选</Button>
          </Space>
          {hasInvalidProfitRange && <Typography.Text type="danger" className="ledger-filter-error">利润范围的最低值不能大于最高值。</Typography.Text>}
        </div>
        <div className="table-wrap">
          <Table rowKey="id" columns={columns} dataSource={items} loading={loading} rowSelection={rowSelection} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂时没有台账数据" /> }} scroll={{ x: 2240 }} pagination={false} />
          {total > 0 && <div className="table-pagination"><Pagination current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={PAGE_SIZE_OPTIONS} showQuickJumper showTotal={(count) => `共 ${count.toLocaleString()} 条`} onChange={handlePageChange} /></div>}
        </div>
      </div>
    </section>
  )
}
