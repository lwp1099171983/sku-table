import {
  CheckCircleFilled,
  CloseCircleFilled,
  DownloadOutlined,
  FilterOutlined,
  InboxOutlined,
  LinkOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Empty, Input, Modal, Progress, Select, Space, Statistic, Table, Tag, Tooltip, Typography, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile, UploadProps } from 'antd'
import type { ProductPricing, PricingBatch } from '@sku-table/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APP_COPY } from '../constants/app'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useAuth } from '../layouts/AuthContext'
import { pricingService } from '../services/pricingService'
import { downloadTemplate, templateFiles } from '../services/templateService'
import './PricingPage.css'

interface PricingRow {
  id: string
  store: string
  productName: string
  supplierSku: string
  purchasePrice: number | null
  weightKg: number | null
  localSku: string
  nameAbbreviation: string
  skuPrefix: string
  sellingPrice: number | null
  actualMarginRate: number | null
  breakevenSellingPrice: number | null
  priceCheck: boolean
  weightCheck: boolean
  breakevenProfit: number | null
  breakevenMarginRate: number | null
  price1: number | null
  shippingFee: number | null
  commissionRate: number | null
  returnRate: number | null
  sourceUrl: string
}

const DEFAULT_PAGE_SIZE = 30
const PAGE_SIZE_OPTIONS = [30, 50, 100]
const KEYWORD_DEBOUNCE_MS = 300

const demoRows: PricingRow[] = []

const toNumber = (value: string | null) => {
  if (value === null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toPricingRow(item: ProductPricing): PricingRow {
  return {
    id: item.id, store: item.store ?? '未填写', productName: item.productName, supplierSku: item.supplierSku ?? '—',
    purchasePrice: toNumber(item.purchasePrice), weightKg: toNumber(item.weightKg), localSku: item.localSku ?? '—', nameAbbreviation: item.nameAbbreviation ?? '—', skuPrefix: item.skuPrefix ?? '—',
    sellingPrice: toNumber(item.sellingPrice), actualMarginRate: toNumber(item.actualMarginRate), breakevenSellingPrice: toNumber(item.breakevenSellingPrice), priceCheck: item.priceCheck, weightCheck: item.weightCheck,
    breakevenProfit: toNumber(item.breakevenProfit), breakevenMarginRate: toNumber(item.breakevenMarginRate), price1: toNumber(item.price1), shippingFee: toNumber(item.shippingFee), commissionRate: toNumber(item.commissionRate), returnRate: toNumber(item.returnRate), sourceUrl: item.sourceUrl ?? '',
  }
}

const currency = (value: number | null) => value === null ? '—' : `¥ ${value.toFixed(2)}`
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`

function checkTag(value: boolean) {
  return value ? <Tag className="check-tag" color="success" icon={<CheckCircleFilled />}>通过</Tag> : <Tag className="check-tag" color="warning" icon={<CloseCircleFilled />}>待检查</Tag>
}

export function PricingPage() {
  const { canImport } = useAuth()
  const { message } = AntdApp.useApp()
  const [rows, setRows] = useState<PricingRow[]>(demoRows)
  const [total, setTotal] = useState(demoRows.length)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  // 首次渲染即进入加载态，避免请求尚未发出时短暂显示空的演示批次。
  const [loading, setLoading] = useState(true)
  const [isDemo, setIsDemo] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [checkStatus, setCheckStatus] = useState<'all' | 'passed' | 'pending'>('all')
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [latestBatch, setLatestBatch] = useState<PricingBatch | null>(null)
  const debouncedKeyword = useDebouncedValue(keyword, KEYWORD_DEBOUNCE_MS)
  const requestSequence = useRef(0)
  const isDemoRef = useRef(isDemo)

  const loadRows = useCallback(async (targetPage = page) => {
    const requestId = ++requestSequence.current
    setLoading(true)
    try {
      const result = await pricingService.list({ page: targetPage, pageSize, keyword: debouncedKeyword.trim() || undefined })
      if (requestId !== requestSequence.current) return
      setRows(result.items.map(toPricingRow))
      setTotal(result.total)
      setIsDemo(false)
      isDemoRef.current = false
    } catch {
      if (requestId === requestSequence.current && !isDemoRef.current) {
        message.error(`${APP_COPY.pricing}数据加载失败，请稍后重试。`)
      }
    } finally {
      if (requestId === requestSequence.current) setLoading(false)
    }
  }, [debouncedKeyword, message, page, pageSize])

  useEffect(() => { void loadRows(page) }, [loadRows, page])

  const filteredRows = useMemo(() => rows.filter((row) => checkStatus === 'all' || (checkStatus === 'passed' ? row.priceCheck && row.weightCheck : !row.priceCheck || !row.weightCheck)), [checkStatus, rows])
  const passedCount = rows.filter((row) => row.priceCheck && row.weightCheck).length
  const pendingCount = rows.filter((row) => !row.priceCheck || !row.weightCheck).length
  const columns: ColumnsType<PricingRow> = useMemo(() => [
    { title: '店铺', dataIndex: 'store', key: 'store', width: 110, fixed: 'left', render: (value: string) => <Tag bordered={false} color="blue">{value}</Tag> },
    { title: '产品名称', dataIndex: 'productName', key: 'productName', width: 240, fixed: 'left', render: (value: string) => <Typography.Text className={value ? '' : 'empty-product-name'} strong ellipsis={{ tooltip: value || '未填写产品名称' }}>{value || '未填写产品名称'}</Typography.Text> },
    { title: '档口SKU', dataIndex: 'supplierSku', key: 'supplierSku', width: 130, render: (value: string) => <span className="mono-cell">{value}</span> },
    { title: '进价', dataIndex: 'purchasePrice', key: 'purchasePrice', width: 105, align: 'right', render: (value: number | null) => <span className="price-cell">{currency(value)}</span> },
    { title: '重量kg', dataIndex: 'weightKg', key: 'weightKg', width: 90, align: 'right', render: (value: number | null) => value === null ? '—' : value.toFixed(3) },
    { title: '[本店] SKU', dataIndex: 'localSku', key: 'localSku', width: 130, render: (value: string) => <span className="mono-cell">{value}</span> },
    { title: '姓名缩写', dataIndex: 'nameAbbreviation', key: 'nameAbbreviation', width: 90, align: 'center' },
    { title: 'SKU前缀', dataIndex: 'skuPrefix', key: 'skuPrefix', width: 90, align: 'center' },
    { title: '[本店]卖价', dataIndex: 'sellingPrice', key: 'sellingPrice', width: 115, align: 'right', render: (value: number | null) => <span className="price-cell selling-price">{currency(value)}</span> },
    { title: '实际利润率', dataIndex: 'actualMarginRate', key: 'actualMarginRate', width: 110, align: 'right', render: (value: number | null) => <span className="rate-cell">{percent(value)}</span> },
    { title: '保本卖价', dataIndex: 'breakevenSellingPrice', key: 'breakevenSellingPrice', width: 110, align: 'right', render: (value: number | null) => currency(value) },
    { title: '价格检测', dataIndex: 'priceCheck', key: 'priceCheck', width: 105, align: 'center', render: (value: boolean) => checkTag(value) },
    { title: '重量检测', dataIndex: 'weightCheck', key: 'weightCheck', width: 105, align: 'center', render: (value: boolean) => checkTag(value) },
    { title: '保本利润', dataIndex: 'breakevenProfit', key: 'breakevenProfit', width: 110, align: 'right', render: (value: number | null) => currency(value) },
    { title: '保本利润率', dataIndex: 'breakevenMarginRate', key: 'breakevenMarginRate', width: 110, align: 'right', render: (value: number | null) => percent(value) },
    { title: '价格1', dataIndex: 'price1', key: 'price1', width: 100, align: 'right', render: (value: number | null) => currency(value) },
    { title: '运费', dataIndex: 'shippingFee', key: 'shippingFee', width: 100, align: 'right', render: (value: number | null) => currency(value) },
    { title: '佣金比例', dataIndex: 'commissionRate', key: 'commissionRate', width: 105, align: 'right', render: (value: number | null) => percent(value) },
    { title: '退货率', dataIndex: 'returnRate', key: 'returnRate', width: 95, align: 'right', render: (value: number | null) => percent(value) },
    { title: '货源地址', dataIndex: 'sourceUrl', key: 'sourceUrl', width: 120, fixed: 'right', render: (value: string) => value ? <Tooltip title={value}><a className="source-link" href={value} target="_blank" rel="noreferrer"><LinkOutlined /> 打开</a></Tooltip> : '—' },
  ], [])

  const uploadProps: UploadProps = {
    accept: '.xlsx,.xls', maxCount: 1,
    beforeUpload: (selectedFile) => { setFile(selectedFile); setUploadProgress(0); return false },
    onRemove: () => { setFile(null); setUploadProgress(0) },
    fileList: file ? [{ uid: '-1', name: file.name, status: 'done' } as UploadFile] : [],
  }

  async function handleUpload() {
    if (!file) { message.error('请选择 Excel 文件。'); return }
    setIsUploading(true)
    try {
      const result = await pricingService.importFile({ file, onProgress: setUploadProgress })
      setLatestBatch(result.batch)
      setIsDemo(false)
      isDemoRef.current = false
      message.success(`已导入 ${result.importedRows.toLocaleString()} 行${APP_COPY.pricing}数据。`)
      setFile(null)
      setUploadProgress(0)
      setIsImportModalOpen(false)
      setPage(1)
      await loadRows(1)
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '导入失败，请检查 20 个字段的表头和数据格式。')
    } finally {
      setIsUploading(false)
    }
  }

  function resetFilters() {
    setKeyword('')
    setCheckStatus('all')
    setPage(1)
  }

  function handleTableChange(nextPage: number, nextPageSize: number) {
    if (nextPageSize !== pageSize) {
      setPageSize(nextPageSize)
      setPage(1)
      return
    }
    setPage(nextPage)
  }

  const batchName = latestBatch?.fileName ?? `${APP_COPY.pricingTemplate}.xlsx`
  const batchDescription = loading ? '正在加载服务端数据...' : latestBatch ? `${latestBatch.totalRows.toLocaleString()} 行 · ${new Date(latestBatch.createdAt).toLocaleString('zh-CN')}` : isDemo ? '页面演示数据' : '服务端最新数据'

  return (
    <section className="content-page pricing-page">
      <div className="page-heading">
        <div><Typography.Text className="eyebrow">PRICING WORKSPACE</Typography.Text><Typography.Title level={1}>{APP_COPY.pricing}</Typography.Title><Typography.Paragraph type="secondary">导入 {APP_COPY.pricingTemplate}，集中核对采购成本、售价和利润结构，所有字段一屏追踪。</Typography.Paragraph></div>
        <Space className="page-actions">
          {canImport && <Button type="primary" icon={<UploadOutlined />} onClick={() => setIsImportModalOpen(true)}>导入{APP_COPY.pricing}</Button>}
          <Button icon={<DownloadOutlined />} onClick={() => downloadTemplate(templateFiles.pricing, `${APP_COPY.pricingTemplate}.xlsx`)}>下载模板</Button>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadRows(page)}>刷新</Button>
        </Space>
      </div>

      {canImport && <Modal title={`导入${APP_COPY.pricing}`} open={isImportModalOpen} width={720} footer={null} maskClosable={!isUploading} keyboard={!isUploading} onCancel={() => { if (!isUploading) { setIsImportModalOpen(false); setFile(null); setUploadProgress(0) } }}>
        <Typography.Paragraph type="secondary">每次导入会单独保存一个统计批次，历史记录不会被覆盖；文件中多个符合模板的 tab 会合并导入。</Typography.Paragraph>
        <Alert type="info" showIcon message="支持 .xlsx / .xls；必须包含 20 个字段：店铺、产品名称、档口SKU、进价、重量kg、[本店] SKU、姓名缩写、SKU前缀、[本店]卖价、实际利润率、保本卖价、价格检测、重量检测、保本利润、保本利润率、价格1、运费、佣金比例、退货率、货源地址。单批最多 5 万行。" />
        <Upload.Dragger {...uploadProps} disabled={isUploading}><p className="ant-upload-drag-icon"><InboxOutlined /></p><p className="ant-upload-text">点击或拖拽 Excel 到这里</p><p className="ant-upload-hint">比例字段可填写 10% 或 0.10，检测字段填写 1/0</p></Upload.Dragger>
        <div className="import-submit-block"><Button type="primary" icon={<UploadOutlined />} loading={isUploading} disabled={!file} onClick={() => void handleUpload()} className="import-submit">开始导入</Button></div>
        {isUploading && <div className="progress-block"><Typography.Text>正在解析并写入数据...</Typography.Text><Progress percent={uploadProgress} status="active" /></div>}
      </Modal>}

      <div className="pricing-meta-bar"><div className="batch-meta"><span className="batch-status-dot" /><div><Typography.Text strong>{batchName} {!latestBatch && !loading && <Tag className="demo-tag" bordered={false}>{isDemo ? '演示批次' : '服务端批次'}</Tag>}</Typography.Text><Typography.Text type="secondary">{batchDescription}</Typography.Text></div></div><Typography.Text type="secondary">字段完整度 <strong className="completeness-value">{loading ? '—' : rows.length ? '100%' : '—'}</strong></Typography.Text></div>

      <div className="pricing-stat-strip"><Statistic title="当前记录" value={total} suffix="条" /><Statistic title="当前页已通过" value={passedCount} suffix="条" valueStyle={{ color: '#2f855a' }} /><Statistic title="当前页待检查" value={pendingCount} suffix="条" valueStyle={{ color: '#c47a12' }} /></div>

      <div className="pricing-toolbar"><Space size="middle" wrap><Typography.Text strong><FilterOutlined /> 筛选</Typography.Text><Input className="pricing-search" allowClear prefix={<SearchOutlined />} placeholder="搜索产品名、SKU、店铺或缩写" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1) }} /><Select className="pricing-status-select" value={checkStatus} onChange={setCheckStatus} options={[{ value: 'all', label: '全部检测状态' }, { value: 'passed', label: '价格和重量均通过' }, { value: 'pending', label: '存在待检查项' }]} />{(keyword || checkStatus !== 'all') && <Button type="link" onClick={resetFilters}>清除筛选</Button>}</Space><Typography.Text type="secondary">显示 {filteredRows.length} / {total} 条</Typography.Text></div>

      <div className="pricing-table-wrap"><Table<PricingRow> rowKey="id" columns={columns} dataSource={filteredRows} loading={loading} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的定价记录" /> }} scroll={{ x: 2400 }} pagination={{ current: page, pageSize, total: checkStatus === 'all' ? total : filteredRows.length, showSizeChanger: true, pageSizeOptions: PAGE_SIZE_OPTIONS, showQuickJumper: true, showTotal: (count) => `共 ${count} 条` }} onChange={(pagination) => handleTableChange(pagination.current ?? 1, pagination.pageSize ?? pageSize)} size="middle" /></div>
      {/* <div className="pricing-footnote"><Typography.Text type="secondary">价格1仅保存 Excel 原始值，不参与系统计算。比例字段按小数保存并以百分比展示。</Typography.Text></div> */}
    </section>
  )
}
