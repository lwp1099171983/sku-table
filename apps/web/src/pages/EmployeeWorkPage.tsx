import { DeleteOutlined, HistoryOutlined, InboxOutlined, LinkOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, AutoComplete, Button, Empty, Input, Modal, Pagination, Popconfirm, Progress, Select, Space, Table, Tag, Typography, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile, UploadProps } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EmployeeWorkBatch, EmployeeWorkItem } from '@sku-table/shared'
import { APP_LABELS } from '../constants/app'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useRecordDeletion } from '../hooks/useRecordDeletion'
import { useAuth } from '../layouts/AuthContext'
import { employeeWorkService } from '../services/employeeWorkService'
import './EmployeeWorkPage.css'

const DEFAULT_PAGE_SIZE = 30
const PAGE_SIZE_OPTIONS = [30, 50, 100]
const SKU_DEBOUNCE_MS = 300
const MAX_IMPORT_FILES = 20

interface SelectedImportFile {
  uid: string
  file: File
}

interface EmployeeImportSummary {
  totalFiles: number
  successfulFiles: number
  failedFiles: string[]
  importedRows: number
  skippedRows: number
  reusedFiles: number
}

function today() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function EmployeeWorkPage() {
  const { canImportEmployeeWork, canDeleteEmployeeWork, currentShop, hasPermission, isAdmin, roles, user } = useAuth()
  const { message } = AntdApp.useApp()
  const [employeeName, setEmployeeName] = useState('')
  const [workDate, setWorkDate] = useState(today)
  const [files, setFiles] = useState<SelectedImportFile[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [importSummary, setImportSummary] = useState<EmployeeImportSummary | null>(null)
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
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)
  const [batches, setBatches] = useState<EmployeeWorkBatch[]>([])
  const [batchPage, setBatchPage] = useState(1)
  const [batchPageSize, setBatchPageSize] = useState(20)
  const [batchTotal, setBatchTotal] = useState(0)
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [isRollingBack, setIsRollingBack] = useState(false)

  const shopId = currentShop?.id ?? null
  const isCustomerSelfImport = roles.includes('customer') && !roles.includes('leader') && !isAdmin
  const importEmployeeName = isCustomerSelfImport
    ? (user?.displayName?.trim() || user?.email || '')
    : employeeName.trim()

  const loadEmployees = useCallback(async () => {
    try {
      setEmployeeOptions(await employeeWorkService.listEmployees(shopId))
    } catch {
      message.error('员工列表加载失败。')
    }
  }, [message, shopId])

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const result = await employeeWorkService.list({
        page,
        pageSize,
        shopId,
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
  }, [debouncedSku, filterDate, filterEmployee, message, page, pageSize, shopId])

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true)
    try {
      const result = await employeeWorkService.listBatches({ page: batchPage, pageSize: batchPageSize, shopId })
      setBatches(result.items)
      setBatchTotal(result.total)
    } catch {
      message.error('导入批次加载失败，请稍后重试。')
    } finally {
      setBatchesLoading(false)
    }
  }, [batchPage, batchPageSize, message, shopId])

  useEffect(() => { void loadEmployees() }, [loadEmployees])
  useEffect(() => { void loadItems() }, [loadItems])
  useEffect(() => { if (isBatchModalOpen) void loadBatches() }, [isBatchModalOpen, loadBatches])

  const { selectedRowKeys, setSelectedRowKeys, isDeleting, handleDelete, confirmDelete } = useRecordDeletion({
    deleteItem: employeeWorkService.deleteItem,
    batchDelete: employeeWorkService.batchDelete,
    shopId,
    onDeleted: loadItems,
  })

  const uploadProps: UploadProps = {
    accept: '.xlsx,.xls',
    multiple: true,
    maxCount: MAX_IMPORT_FILES,
    beforeUpload: (selectedFile) => {
      setFiles((current) => {
        if (current.length >= MAX_IMPORT_FILES) {
          message.warning(`一次最多选择 ${MAX_IMPORT_FILES} 个 Excel 文件。`)
          return current
        }
        return [...current, { uid: selectedFile.uid, file: selectedFile }]
      })
      setImportSummary(null)
      setUploadProgress(0)
      return false
    },
    onRemove: (selectedFile) => {
      setFiles((current) => current.filter((item) => item.uid !== selectedFile.uid))
      setImportSummary(null)
      setUploadProgress(0)
    },
    fileList: files.map(({ uid, file }) => ({ uid, name: file.name, status: 'done' }) as UploadFile),
  }

  async function handleUpload() {
    if (!shopId) {
      message.error('请先在顶部选择具体店铺，再导入员工数据。')
      return
    }
    if (!importEmployeeName) {
      message.error('请输入员工姓名。')
      return
    }
    if (!workDate) {
      message.error('请选择工作日期。')
      return
    }
    if (files.length === 0) {
      message.error('请至少选择一个 Excel 文件。')
      return
    }

    setIsUploading(true)
    setImportSummary(null)
    const selectedFiles = [...files]
    let successfulFiles = 0
    let importedRows = 0
    let skippedRows = 0
    let reusedFiles = 0
    const failedFiles: string[] = []

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const selectedFile = selectedFiles[index]
      try {
        const result = await employeeWorkService.importFile({
          shopId,
          employeeName: importEmployeeName,
          workDate,
          file: selectedFile.file,
          onProgress: (progress) => {
            setUploadProgress(Math.round(((index + progress / 100) / selectedFiles.length) * 100))
          },
        })
        successfulFiles += 1
        importedRows += result.importedRows
        skippedRows += result.skippedRows
        if (result.reused) reusedFiles += 1
      } catch (error) {
        const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
        failedFiles.push(`${selectedFile.file.name}：${apiMessage || '文件格式或内容不正确'}`)
      } finally {
        setUploadProgress(Math.round(((index + 1) / selectedFiles.length) * 100))
      }
    }

    const summary: EmployeeImportSummary = {
      totalFiles: selectedFiles.length,
      successfulFiles,
      failedFiles,
      importedRows,
      skippedRows,
      reusedFiles,
    }
    setImportSummary(summary)

    try {
      if (successfulFiles > 0) {
        setEmployeeOptions((current) => current.includes(importEmployeeName) ? current : [...current, importEmployeeName].sort())
        setPage(1)
        await loadItems()
      }

      if (failedFiles.length === selectedFiles.length) {
        message.error(`共 ${selectedFiles.length} 个文件，全部导入失败。`)
      } else if (failedFiles.length > 0) {
        message.warning(`已处理 ${successfulFiles}/${selectedFiles.length} 个文件，${failedFiles.length} 个失败。`)
      } else if (reusedFiles === selectedFiles.length) {
        message.info('所选文件此前均已处理，本次未新增数据。')
      } else if (skippedRows > 0) {
        message.warning(`已导入 ${importedRows.toLocaleString()} 行，跳过 ${skippedRows.toLocaleString()} 行重复货号。`)
      } else {
        message.success(`已从 ${successfulFiles} 个文件导入 ${importedRows.toLocaleString()} 行员工工作数据。`)
      }
    } finally {
      setIsUploading(false)
    }
  }

  function openImportModal() {
    if (!currentShop) {
      message.warning('当前为全部店铺，请先在顶部选择一个具体店铺，再导入员工数据。')
      return
    }
    setIsImportModalOpen(true)
    void loadEmployees()
  }

  function closeImportModal() {
    if (isUploading) return
    setIsImportModalOpen(false)
    setEmployeeName('')
    setWorkDate(today())
    setFiles([])
    setUploadProgress(0)
    setImportSummary(null)
  }

  async function handleRollback(batch: EmployeeWorkBatch) {
    setIsRollingBack(true)
    try {
      await employeeWorkService.rollbackBatch(batch.id)
      message.success(`已回滚批次「${batch.fileName}」，该批次数据不再展示。`)
      await loadBatches()
      await loadItems()
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '批次回滚失败，请稍后重试。')
    } finally {
      setIsRollingBack(false)
    }
  }

  const batchColumns: ColumnsType<EmployeeWorkBatch> = [
    { title: '店铺', dataIndex: 'shopName', key: 'shopName', width: 120 },
    { title: '员工', dataIndex: 'employeeName', key: 'employeeName', width: 100 },
    { title: '工作日期', dataIndex: 'workDate', key: 'workDate', width: 110 },
    { title: '文件名', dataIndex: 'fileName', key: 'fileName', ellipsis: true },
    { title: '行数', dataIndex: 'totalRows', key: 'totalRows', width: 80, align: 'right' as const, render: (value: number) => value.toLocaleString() },
    { title: '导入时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false }) },
    {
      title: '状态',
      dataIndex: 'archivedAt',
      key: 'archivedAt',
      width: 90,
      render: (value: string | null) => value ? <Tag color="red">已回滚</Tag> : <Tag color="green">正常</Tag>,
    },
    ...(hasPermission('employee_work.rollback') ? [{
      title: '操作',
      key: 'action',
      width: 90,
      render: (_, record) => record.archivedAt ? null : (
        <Popconfirm
          title="确认回滚这个批次？"
          description="回滚后数据不再展示，批次记录保留。"
          okText="回滚"
          okButtonProps={{ danger: true }}
          cancelText="取消"
          onConfirm={() => handleRollback(record)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} loading={isRollingBack} aria-label="回滚批次" />
        </Popconfirm>
      ),
    } as ColumnsType<EmployeeWorkBatch>[number]] : []),
  ]

  const columns: ColumnsType<EmployeeWorkItem> = useMemo(() => {
    const base: ColumnsType<EmployeeWorkItem> = []
    if (currentShop === null) {
      base.push({ title: '店铺', dataIndex: 'shopName', key: 'shopName', width: 130, fixed: 'left' })
    }
    base.push(
      { title: '员工', dataIndex: 'employeeName', key: 'employeeName', width: 110, fixed: 'left' },
      { title: '工作日期', dataIndex: 'workDate', key: 'workDate', width: 112, fixed: 'left' },
      // 自动序号：按当前列表顺序全局连续编号（跨分页累计），不受 Excel 原始序号影响
      { title: '序号', key: 'seq', width: 70, render: (_, __, index: number) => (page - 1) * pageSize + index + 1 },
      { title: '货号', dataIndex: 'sku', key: 'sku', width: 140, render: (value: string | null) => value || '—' },
      { title: '采集平台', dataIndex: 'platform', key: 'platform', width: 110, render: (value: string | null) => value ? <Tag bordered={false} color="blue">{value}</Tag> : '—' },
      { title: '采集商品名称', dataIndex: 'name', key: 'name', width: 260, ellipsis: true },
      { title: '采集商品链接', dataIndex: 'url', key: 'url', width: 150, render: (value: string | null) => value ? <a href={value} target="_blank" rel="noreferrer"><LinkOutlined /> 打开链接</a> : '—' },
      { title: '采集规格', dataIndex: 'spec', key: 'spec', width: 180, ellipsis: true, render: (value: string | null) => value || '—' },
      { title: '采集价格', dataIndex: 'price', key: 'price', width: 120, render: (value: string | null) => value ? <span className="price-cell">¥ {value}</span> : '—' },
    )
    if (canDeleteEmployeeWork) {
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
  }, [canDeleteEmployeeWork, currentShop, page, pageSize])

  const rowSelection = canDeleteEmployeeWork ? {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  } : undefined

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
    <section className="content-page data-table-page">
      <div className="page-heading">
        <div>
          <Typography.Text className="eyebrow">EMPLOYEE WORK LOG</Typography.Text>
          <Typography.Title level={1}>{APP_LABELS.employeeWork}</Typography.Title>
          <Typography.Paragraph type="secondary">按店铺隔离，老板上传员工每日采集的商品，按员工和日期追溯工作内容。</Typography.Paragraph>
        </div>
        <Space className="page-actions">
          {canImportEmployeeWork && <Button type="primary" icon={<UploadOutlined />} onClick={openImportModal}>导入员工数据</Button>}
          <Button icon={<HistoryOutlined />} onClick={() => { setIsBatchModalOpen(true); setBatchPage(1) }}>导入记录</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { void loadEmployees(); void loadItems() }}>刷新</Button>
        </Space>
      </div>

      {canImportEmployeeWork && <Modal
        title="导入员工数据"
        open={isImportModalOpen}
        width={720}
        footer={null}
        maskClosable={!isUploading}
        keyboard={!isUploading}
        onCancel={closeImportModal}
      >
        <Typography.Paragraph type="secondary">可同时上传多个 Excel，数据归属当前店铺{currentShop ? `（${currentShop.name}）` : ''}。</Typography.Paragraph>
        <Alert type="info" showIcon message={`支持 .xlsx / .xls，一次最多 ${MAX_IMPORT_FILES} 个文件；每个文件单独生成导入批次，单文件最多 5 万行；同一店铺的重复货号会自动跳过。`} />
        <div className="work-import-grid">
          <label className="field-label">员工姓名{isCustomerSelfImport
            ? <Input value={importEmployeeName} disabled />
            : <AutoComplete
              value={employeeName}
              options={employeeOptions.map((name) => ({ value: name, label: name }))}
              maxLength={100}
              allowClear
              showSearch
              className="employee-name-autocomplete"
              placeholder="选择已有员工或输入新姓名"
              filterOption={(inputValue, option) => String(option?.value ?? '').toLowerCase().includes(inputValue.toLowerCase())}
              onChange={setEmployeeName}
            />}</label>
          <label className="field-label">工作日期<Input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} /></label>
        </div>
        <Upload.Dragger {...uploadProps} disabled={isUploading}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽多个员工 Excel 到这里</p>
          <p className="ant-upload-hint">已选 {files.length}/{MAX_IMPORT_FILES} 个文件，每个文件名都会记录到导入批次中</p>
        </Upload.Dragger>
        {!importSummary && <div className="import-submit-block">
          <Button type="primary" icon={<UploadOutlined />} loading={isUploading} onClick={() => void handleUpload()} className="import-submit">开始导入（{files.length} 个文件）</Button>
        </div>}
        {isUploading && <div className="progress-block"><Typography.Text>正在逐个上传和写入文件...</Typography.Text><Progress percent={uploadProgress} status="active" /></div>}
        {importSummary && <Alert
          className="import-result"
          type={importSummary.failedFiles.length === importSummary.totalFiles ? 'error' : importSummary.failedFiles.length > 0 ? 'warning' : 'success'}
          showIcon
          message={`处理完成：成功 ${importSummary.successfulFiles}/${importSummary.totalFiles} 个文件`}
          description={(
            <Space direction="vertical" size={2}>
              <span>新增 {importSummary.importedRows.toLocaleString()} 行，跳过 {importSummary.skippedRows.toLocaleString()} 行，重复文件 {importSummary.reusedFiles} 个。</span>
              {importSummary.failedFiles.slice(0, 3).map((failure, index) => <span key={`${index}-${failure}`}>{failure}</span>)}
              {importSummary.failedFiles.length > 3 && <span>另有 {importSummary.failedFiles.length - 3} 个文件失败，请查看提示后重试。</span>}
            </Space>
          )}
        />}
      </Modal>}

      <Modal
        title="导入记录"
        open={isBatchModalOpen}
        width={960}
        footer={null}
        onCancel={() => setIsBatchModalOpen(false)}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">按批次追溯导入来源（文件名、员工、日期、行数）；管理员可回滚整批数据，回滚后默认列表不再展示。</Typography.Paragraph>
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

      <div className="records-section">
        <div className="section-heading">
          <div><Typography.Title level={4}>工作明细</Typography.Title><Typography.Text type="secondary">共 {total.toLocaleString()} 条记录</Typography.Text></div>
          {canDeleteEmployeeWork && selectedRowKeys.length > 0 && (
            <Button danger icon={<DeleteOutlined />} loading={isDeleting} onClick={() => confirmDelete(selectedRowKeys.map(Number), `确认删除选中的 ${selectedRowKeys.length} 条记录？`, '删除后不可恢复，同时会扣减对应导入批次的记录数。')}>
              批量删除（{selectedRowKeys.length}）
            </Button>
          )}
        </div>
        <div className="filter-bar work-filter-bar">
          <Space size="middle" wrap>
            <Input className="sku-filter-input" prefix={<SearchOutlined />} allowClear placeholder="按货号筛选" value={filterSku} onChange={(event) => { setFilterSku(event.target.value); setPage(1) }} />
            <Select className="employee-filter-select" allowClear showSearch placeholder="全部员工" value={filterEmployee} options={employeeOptions.map((name) => ({ value: name, label: name }))} onChange={(value) => { setFilterEmployee(value); setPage(1) }} />
            <Input className="employee-date-filter" type="date" value={filterDate} onChange={(event) => { setFilterDate(event.target.value); setPage(1) }} />
            <Button onClick={resetFilters}>清除筛选</Button>
          </Space>
        </div>
        <div className="table-wrap">
          <Table rowKey="id" columns={columns} dataSource={items} loading={loading} rowSelection={rowSelection} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂时没有员工工作数据" /> }} scroll={{ x: 1300 }} pagination={false} />
          {total > 0 && <div className="table-pagination"><Pagination current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={PAGE_SIZE_OPTIONS} showQuickJumper showTotal={(count) => `共 ${count.toLocaleString()} 条`} onChange={handlePageChange} /></div>}
        </div>
      </div>
    </section>
  )
}
