import { CheckCircleOutlined, InboxOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Card, Empty, Form, Input, Modal, Space, Table, Tag, Typography, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import { useCallback, useEffect, useState } from 'react'
import type { ShippingRate, ShippingRateVersion } from '@sku-table/shared'
import { shippingRatesService } from '../services/shippingRatesService'
import './ShippingRatesPage.css'

interface ImportFormValues {
  versionName: string
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

export function ShippingRatesPage() {
  const { message, modal } = AntdApp.useApp()
  const [versions, setVersions] = useState<ShippingRateVersion[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<ShippingRateVersion | null>(null)
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])
  const [importForm] = Form.useForm<ImportFormValues>()

  const loadVersions = useCallback(async (preferredVersionId?: string) => {
    setLoadingVersions(true)
    try {
      const nextVersions = await shippingRatesService.listVersions()
      setVersions(nextVersions)
      setSelectedVersionId((current) => (
        preferredVersionId
          ?? (current && nextVersions.some((version) => version.id === current) ? current : nextVersions[0]?.id ?? null)
      ))
    } catch {
      message.error('资费版本列表加载失败。')
    } finally {
      setLoadingVersions(false)
    }
  }, [message])

  useEffect(() => {
    void loadVersions()
  }, [loadVersions])

  const loadDetail = useCallback(async (versionId: string) => {
    setLoadingDetail(true)
    try {
      const detail = await shippingRatesService.getVersionDetail(versionId)
      setSelectedVersion(detail.version)
      setRates(detail.rates)
    } catch {
      setSelectedVersion(null)
      setRates([])
      message.error('资费规则加载失败。')
    } finally {
      setLoadingDetail(false)
    }
  }, [message])

  useEffect(() => {
    if (selectedVersionId) {
      void loadDetail(selectedVersionId)
    } else {
      setSelectedVersion(null)
      setRates([])
    }
  }, [loadDetail, selectedVersionId])

  function openImportModal() {
    importForm.resetFields()
    setUploadFiles([])
    setIsImportOpen(true)
  }

  async function handleImport() {
    const values = await importForm.validateFields()
    const selectedFile = uploadFiles[0]
    const file = selectedFile?.originFileObj ?? (selectedFile as unknown as File | undefined)
    if (!file) {
      message.error('请选择物流资费 Excel。')
      return
    }
    setIsSaving(true)
    try {
      const version = await shippingRatesService.importFile({ versionName: values.versionName.trim(), file })
      message.success(`已导入 ${version.ruleCount} 条资费规则。`)
      setIsImportOpen(false)
      await loadVersions(version.id)
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '物流资费表导入失败。')
    } finally {
      setIsSaving(false)
    }
  }

  function confirmActivate(version: ShippingRateVersion) {
    modal.confirm({
      title: `启用资费版本“${version.name}”？`,
      content: '启用后，之后保存包裹重量的台账会按此版本重算；已重算记录保留原版本和结果。',
      okText: '启用',
      cancelText: '取消',
      onOk: async () => {
        try {
          await shippingRatesService.activateVersion(version.id)
          message.success(`已启用“${version.name}”。`)
          await loadVersions(version.id)
        } catch (error) {
          const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
          message.error(apiMessage || '资费版本启用失败。')
        }
      },
    })
  }

  const versionColumns: ColumnsType<ShippingRateVersion> = [
    {
      title: '版本',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space size={6} wrap>
          <Typography.Text strong>{name}</Typography.Text>
          {record.isActive && <Tag color="green" icon={<CheckCircleOutlined />}>当前启用</Tag>}
        </Space>
      ),
    },
    { title: '来源文件', dataIndex: 'sourceFileName', key: 'sourceFileName', ellipsis: true },
    { title: '规则数', dataIndex: 'ruleCount', key: 'ruleCount', width: 88, align: 'right' },
    {
      title: '导入时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (value: string) => formatDate(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 92,
      render: (_, record) => (
        record.isActive
          ? <Typography.Text type="secondary">使用中</Typography.Text>
          : <Button type="link" onClick={() => confirmActivate(record)}>启用</Button>
      ),
    },
  ]

  const rateColumns: ColumnsType<ShippingRate> = [
    { title: '渠道名称', dataIndex: 'channelName', key: 'channelName', ellipsis: true },
    { title: '基础价格（元）', dataIndex: 'basePrice', key: 'basePrice', width: 132, align: 'right' },
    { title: '每克价格（元）', dataIndex: 'pricePerGram', key: 'pricePerGram', width: 132, align: 'right' },
    {
      title: '计费重量（克）',
      key: 'weight',
      width: 160,
      align: 'right',
      render: (_, record) => `${record.minWeight} - ${record.maxWeight}`,
    },
  ]

  return (
    <section className="content-page shipping-rates-page">
      <div className="page-heading">
        <div>
          <Typography.Title level={1}>物流资费</Typography.Title>
          <Typography.Paragraph type="secondary">导入新版物流资费表后，确认无误再启用。</Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadVersions()} loading={loadingVersions}>刷新</Button>
          <Button type="primary" icon={<UploadOutlined />} onClick={openImportModal}>导入资费表</Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        message="资费版本只影响之后保存的重量重算，已计算的历史台账保留原有结果。"
      />

      <Card bordered={false} className="shipping-rates-card">
        <div className="table-wrap">
          <Table
            rowKey="id"
            columns={versionColumns}
            dataSource={versions}
            loading={loadingVersions}
            pagination={false}
            onRow={(record) => ({ onClick: () => setSelectedVersionId(record.id) })}
            rowClassName={(record) => record.id === selectedVersionId ? 'shipping-rate-version-selected' : 'shipping-rate-version-row'}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无资费版本" /> }}
            scroll={{ x: 760 }}
          />
        </div>
      </Card>

      <div className="shipping-rate-detail-heading">
        <Typography.Title level={2}>{selectedVersion ? `${selectedVersion.name} 的规则` : '资费规则'}</Typography.Title>
        {selectedVersion && <Typography.Text type="secondary">共 {selectedVersion.ruleCount} 条</Typography.Text>}
      </div>
      <Card bordered={false}>
        <div className="table-wrap">
          <Table
            rowKey="id"
            columns={rateColumns}
            dataSource={rates}
            loading={loadingDetail}
            pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择资费版本" /> }}
            scroll={{ x: 720 }}
          />
        </div>
      </Card>

      <Modal
        title="导入物流资费表"
        open={isImportOpen}
        onCancel={() => setIsImportOpen(false)}
        onOk={() => void handleImport()}
        confirmLoading={isSaving}
        okText="导入"
        cancelText="取消"
      >
        <Form form={importForm} layout="vertical" requiredMark={false}>
          <Form.Item label="版本名称" name="versionName" rules={[{ required: true, message: '请输入版本名称' }, { max: 100, message: '版本名称不能超过 100 个字符' }]}>
            <Input placeholder="例如：2026 年 9 月资费表" maxLength={100} />
          </Form.Item>
          <Form.Item label="物流资费 Excel" required>
            <Upload.Dragger
              accept=".xlsx,.xls"
              maxCount={1}
              fileList={uploadFiles}
              beforeUpload={(file) => {
                setUploadFiles([file])
                return false
              }}
              onRemove={() => {
                setUploadFiles([])
                return true
              }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">选择物流资费 Excel</p>
            </Upload.Dragger>
          </Form.Item>
        </Form>
      </Modal>
    </section>
  )
}
