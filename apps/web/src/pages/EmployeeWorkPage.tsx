import { DownloadOutlined, InboxOutlined, LinkOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, AutoComplete, Button, Empty, Input, Modal, Pagination, Progress, Select, Space, Table, Tag, Typography, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile, UploadProps } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EmployeeWorkBatch, EmployeeWorkItem } from '@sku-table/shared'
import { APP_COPY } from '../constants/app'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useAuth } from '../layouts/AuthContext'
import { employeeWorkService } from '../services/employeeWorkService'
import { downloadTemplate, templateFiles } from '../services/templateService'
import './EmployeeWorkPage.css'

const DEFAULT_PAGE_SIZE = 30
const PAGE_SIZE_OPTIONS = [30, 50, 100]
const SKU_DEBOUNCE_MS = 300

function today() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function EmployeeWorkPage() {
  const { canImport } = useAuth()
  const { message } = AntdApp.useApp()
  const [employeeName, setEmployeeName] = useState('')
  const [workDate, setWorkDate] = useState(today)
  const [file, setFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [lastBatch, setLastBatch] = useState<EmployeeWorkBatch | null>(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [employeeOptions, setEmployeeOptions] = useState<string[]>([])
  const [filterEmployee, setFilterEmployee] = useState<string>()
  const [filterDate, setFilterDate] = useState('')
  const [filterSku, setFilterSku] = useState('')
  const debouncedSku = useDebouncedValue(filterSku, SKU_DEBOUNCE_MS)
  const [items, setItems] = useState<EmployeeWorkItem[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadEmployees = useCallback(async () => {
    try {
      setEmployeeOptions(await employeeWorkService.listEmployees())
    } catch {
      message.error('员工列表加载失败。')
    }
  }, [message])

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const result = await employeeWorkService.list({
        page,
        pageSize,
        employeeName: filterEmployee,
        workDate: filterDate || undefined,
        sku: debouncedSku.trim() || undefined,
      })
      setItems(result.items)
      setTotal(result.total)
    } catch {
      message.error('员工工作数据加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [debouncedSku, filterDate, filterEmployee, message, page, pageSize])

  useEffect(() => { void loadEmployees() }, [loadEmployees])
  useEffect(() => { void loadItems() }, [loadItems])

  const uploadProps: UploadProps = {
    accept: '.xlsx,.xls',
    maxCount: 1,
    beforeUpload: (selectedFile) => {
      setFile(selectedFile)
      setLastBatch(null)
      setUploadProgress(0)
      return false
    },
    onRemove: () => {
      setFile(null)
      setLastBatch(null)
    },
    fileList: file ? [{ uid: '-1', name: file.name, status: 'done' } as UploadFile] : [],
  }

  async function handleUpload() {
    if (!employeeName.trim()) {
      console.log('handleUpload1', employeeName, workDate, file)
      message.error('请输入员工姓名。')
      return
    }
    if (!workDate) {
      message.error('请选择工作日期。')
      return
    }
    if (!file) {
      message.error('请选择 Excel 文件。')
      return
    }

    setIsUploading(true)
    setLastBatch(null)
    try {
      const result = await employeeWorkService.importFile({
        employeeName: employeeName.trim(),
        workDate,
        file,
        onProgress: setUploadProgress,
      })
      setLastBatch(result.batch)
      setEmployeeOptions((current) => current.includes(employeeName.trim()) ? current : [...current, employeeName.trim()].sort())
      message.success(`已导入 ${result.importedRows.toLocaleString()} 行员工工作数据。`)
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

  function openImportModal() {
    setIsImportModalOpen(true)
    void loadEmployees()
  }

  function closeImportModal() {
    if (isUploading) return
    setIsImportModalOpen(false)
    setEmployeeName('')
    setWorkDate(today())
    setFile(null)
    setUploadProgress(0)
    setLastBatch(null)
  }

  const columns: ColumnsType<EmployeeWorkItem> = useMemo(() => [
    { title: '员工', dataIndex: 'employeeName', key: 'employeeName', width: 110, fixed: 'left' },
    { title: '工作日期', dataIndex: 'workDate', key: 'workDate', width: 112, fixed: 'left' },
    { title: '序号', dataIndex: 'seq', key: 'seq', width: 70, render: (value: string | null) => value || '—' },
    { title: '货号', dataIndex: 'sku', key: 'sku', width: 140, render: (value: string | null) => value || '—' },
    { title: '采集平台', dataIndex: 'platform', key: 'platform', width: 110, render: (value: string | null) => value ? <Tag bordered={false} color="blue">{value}</Tag> : '—' },
    { title: '采集商品名称', dataIndex: 'name', key: 'name', width: 260, ellipsis: true },
    { title: '采集商品链接', dataIndex: 'url', key: 'url', width: 150, render: (value: string | null) => value ? <a href={value} target="_blank" rel="noreferrer"><LinkOutlined /> 打开链接</a> : '—' },
    { title: '采集规格', dataIndex: 'spec', key: 'spec', width: 180, ellipsis: true, render: (value: string | null) => value || '—' },
    { title: '采集价格', dataIndex: 'price', key: 'price', width: 120, render: (value: string | null) => value ? <span className="price-cell">¥ {value}</span> : '—' },
  ], [])

  function resetFilters() {
    setFilterEmployee(undefined)
    setFilterDate('')
    setFilterSku('')
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
          <Typography.Text className="eyebrow">EMPLOYEE WORK LOG</Typography.Text>
          <Typography.Title level={1}>{APP_COPY.employeeWork}</Typography.Title>
          <Typography.Paragraph type="secondary">老板上传员工每日采集的商品，按员工和日期追溯工作内容。</Typography.Paragraph>
        </div>
        <Space className="page-actions">
          {canImport && <Button type="primary" icon={<UploadOutlined />} onClick={openImportModal}>导入员工数据</Button>}
          <Button icon={<DownloadOutlined />} onClick={() => downloadTemplate(templateFiles.employeeWork, '员工工作记录模板.xlsx')}>下载模板</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { void loadEmployees(); void loadItems() }}>刷新</Button>
        </Space>
      </div>

      {canImport && <Modal
        title="导入员工数据"
        open={isImportModalOpen}
        width={720}
        footer={null}
        maskClosable={!isUploading}
        keyboard={!isUploading}
        onCancel={closeImportModal}
      >
        <Typography.Paragraph type="secondary">上传的 Excel 只需要包含 7 个商品字段，员工姓名和工作日期在这里填写。</Typography.Paragraph>
        <Alert type="info" showIcon message="支持 .xlsx / .xls；表头为：序号、货号、采集平台、采集商品名称、采集商品链接、采集规格、采集价格(CNY)；单批最多 5 万行。" />
        <div className="work-import-grid">
          <label className="field-label">员工姓名<AutoComplete
            value={employeeName}
            options={employeeOptions.map((name) => ({ value: name, label: name }))}
            maxLength={100}
            allowClear
            showSearch
            className="employee-name-autocomplete"
            placeholder="选择已有员工或输入新姓名"
            filterOption={(inputValue, option) => String(option?.value ?? '').toLowerCase().includes(inputValue.toLowerCase())}
            onChange={setEmployeeName}
          /></label>
          <label className="field-label">工作日期<Input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} /></label>
        </div>
        <Upload.Dragger {...uploadProps} disabled={isUploading}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽员工 Excel 到这里</p>
          <p className="ant-upload-hint">文件名会记录到导入批次中</p>
        </Upload.Dragger>
        {!lastBatch && <div className="import-submit-block">
          <Button type="primary" icon={<UploadOutlined />} loading={isUploading} onClick={() => void handleUpload()} className="import-submit">开始导入</Button>
        </div>}
        {isUploading && <div className="progress-block"><Typography.Text>正在上传和写入数据...</Typography.Text><Progress percent={uploadProgress} status="active" /></div>}
        {lastBatch && <Alert className="import-result" type="success" showIcon message="导入完成" description={`员工：${lastBatch.employeeName}；工作日期：${lastBatch.workDate}；共 ${lastBatch.totalRows.toLocaleString()} 行。`} />}
      </Modal>}

      <div className="records-section">
        <div className="section-heading"><div><Typography.Title level={4}>工作明细</Typography.Title><Typography.Text type="secondary">共 {total.toLocaleString()} 条记录</Typography.Text></div></div>
        <div className="filter-bar work-filter-bar">
          <Space size="middle" wrap>
            <Input className="sku-filter-input" prefix={<SearchOutlined />} allowClear placeholder="按货号筛选" value={filterSku} onChange={(event) => { setFilterSku(event.target.value); setPage(1) }} />
            <Select className="employee-filter-select" allowClear showSearch placeholder="全部员工" value={filterEmployee} options={employeeOptions.map((name) => ({ value: name, label: name }))} onChange={(value) => { setFilterEmployee(value); setPage(1) }} />
            <Input className="employee-date-filter" type="date" value={filterDate} onChange={(event) => { setFilterDate(event.target.value); setPage(1) }} />
            <Button onClick={resetFilters}>清除筛选</Button>
          </Space>
        </div>
        <div className="table-wrap">
          <Table rowKey="id" columns={columns} dataSource={items} loading={loading} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂时没有员工工作数据" /> }} scroll={{ x: 1300 }} pagination={false} />
          {total > 0 && <div className="table-pagination"><Pagination current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={PAGE_SIZE_OPTIONS} showQuickJumper showTotal={(count) => `共 ${count.toLocaleString()} 条`} onChange={handlePageChange} /></div>}
        </div>
      </div>
    </section>
  )
}
