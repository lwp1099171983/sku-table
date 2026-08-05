import { InboxOutlined, LinkOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Empty, Input, Pagination, Progress, Select, Space, Table, Tag, Typography, Upload, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile, UploadProps } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EmployeeWorkBatch, EmployeeWorkItem } from '@sku-table/shared'
import { useAuth } from '../layouts/AuthContext'
import { employeeWorkService } from '../services/employeeWorkService'

const PAGE_SIZE = 100

function today() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function EmployeeWorkPage() {
  const { canImport } = useAuth()
  const [employeeName, setEmployeeName] = useState('')
  const [workDate, setWorkDate] = useState(today)
  const [file, setFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [lastBatch, setLastBatch] = useState<EmployeeWorkBatch | null>(null)
  const [employeeOptions, setEmployeeOptions] = useState<string[]>([])
  const [filterEmployee, setFilterEmployee] = useState<string>()
  const [filterDate, setFilterDate] = useState('')
  const [items, setItems] = useState<EmployeeWorkItem[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadEmployees = useCallback(async () => {
    try {
      setEmployeeOptions(await employeeWorkService.listEmployees())
    } catch {
      message.error('员工列表加载失败。')
    }
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const result = await employeeWorkService.list({
        page,
        pageSize: PAGE_SIZE,
        employeeName: filterEmployee,
        workDate: filterDate || undefined,
      })
      setItems(result.items)
      setTotal(result.total)
    } catch {
      message.error('员工工作数据加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [filterDate, filterEmployee, page])

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
    if (!file || !employeeName.trim() || !workDate) {
      message.warning('请填写员工姓名、工作日期并选择 Excel 文件。')
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
      message.error(apiMessage || '导入失败，请检查文件格式后重试。')
    } finally {
      setIsUploading(false)
    }
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
    setPage(1)
  }

  return (
    <section className="content-page">
      <div className="page-heading">
        <div>
          <Typography.Text className="eyebrow">EMPLOYEE WORK LOG</Typography.Text>
          <Typography.Title level={1}>员工工作记录</Typography.Title>
          <Typography.Paragraph type="secondary">老板上传员工每日采集的商品，按员工和日期追溯工作内容。</Typography.Paragraph>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => { void loadEmployees(); void loadItems() }}>刷新</Button>
      </div>

      {canImport && <Card className="work-import-card" bordered={false}>
        <div className="section-heading">
          <div><Typography.Title level={4}>导入员工数据</Typography.Title><Typography.Text type="secondary">上传的 Excel 只需要包含 7 个商品字段，员工姓名和工作日期在这里填写。</Typography.Text></div>
        </div>
        <Alert type="info" showIcon message="支持 .xlsx / .xls；表头为：序号、货号、采集平台、采集商品名称、采集商品链接、采集规格、采集价格(CNY)；单批最多 5 万行。" />
        <div className="work-import-grid">
          <label className="field-label">员工姓名<Input value={employeeName} maxLength={100} placeholder="例如：小王" onChange={(event) => setEmployeeName(event.target.value)} /></label>
          <label className="field-label">工作日期<Input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} /></label>
        </div>
        <Upload.Dragger {...uploadProps} disabled={isUploading}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽员工 Excel 到这里</p>
          <p className="ant-upload-hint">文件名会记录到导入批次中</p>
        </Upload.Dragger>
        {file && !lastBatch && <Button type="primary" icon={<UploadOutlined />} loading={isUploading} onClick={() => void handleUpload()} className="import-submit">开始导入</Button>}
        {isUploading && <div className="progress-block"><Typography.Text>正在上传和写入数据...</Typography.Text><Progress percent={uploadProgress} status="active" /></div>}
        {lastBatch && <Alert className="import-result" type="success" showIcon message="导入完成" description={`员工：${lastBatch.employeeName}；工作日期：${lastBatch.workDate}；共 ${lastBatch.totalRows.toLocaleString()} 行。`} />}
      </Card>}

      <div className="records-section">
        <div className="section-heading"><div><Typography.Title level={4}>工作明细</Typography.Title><Typography.Text type="secondary">共 {total.toLocaleString()} 条记录</Typography.Text></div></div>
        <div className="filter-bar work-filter-bar">
          <Space size="middle" wrap>
            <Select allowClear showSearch placeholder="全部员工" value={filterEmployee} style={{ width: 180 }} options={employeeOptions.map((name) => ({ value: name, label: name }))} onChange={(value) => { setFilterEmployee(value); setPage(1) }} />
            <Input type="date" value={filterDate} style={{ width: 170 }} onChange={(event) => { setFilterDate(event.target.value); setPage(1) }} />
            <Button onClick={resetFilters}>清除筛选</Button>
          </Space>
        </div>
        <div className="table-wrap">
          <Table rowKey="id" columns={columns} dataSource={items} loading={loading} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂时没有员工工作数据" /> }} scroll={{ x: 1300 }} pagination={false} />
          {total > 0 && <div className="table-pagination"><Pagination current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} showQuickJumper showTotal={(count) => `共 ${count.toLocaleString()} 条`} onChange={setPage} /></div>}
        </div>
      </div>
    </section>
  )
}
