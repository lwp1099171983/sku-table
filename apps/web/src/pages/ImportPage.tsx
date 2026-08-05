import { InboxOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Progress, Result, Space, Typography, Upload, message } from 'antd'
import type { UploadProps } from 'antd'
import { useState } from 'react'
import { importService } from '../services/importService'
import type { ImportBatch } from '@sku-table/shared'

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [batch, setBatch] = useState<ImportBatch | null>(null)

  const uploadProps: UploadProps = {
    accept: '.xlsx,.xls',
    maxCount: 1,
    beforeUpload: (selectedFile) => {
      setFile(selectedFile)
      setBatch(null)
      setProgress(0)
      return false
    },
    onRemove: () => { setFile(null); setBatch(null) },
    fileList: file ? [{ uid: '-1', name: file.name, status: 'done' }] : [],
  }

  async function handleUpload() {
    if (!file) return
    setIsUploading(true)
    try {
      const result = await importService.upload(file, setProgress)
      setBatch(result.batch)
      message.success('文件已提交，正在处理。')
    } catch {
      message.error('导入失败，请检查文件格式后重试。')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <section className="content-page narrow-page">
      <div className="page-heading"><div><Typography.Text className="eyebrow">IMPORT CENTER</Typography.Text><Typography.Title level={1}>导入数据</Typography.Title><Typography.Paragraph type="secondary">上传固定模板 Excel，批次会自动记录来源和处理结果。</Typography.Paragraph></div></div>
      <Alert type="info" showIcon message="导入前请确认表头顺序：序号、货号、平台、商品名称、链接、规格、价格。单批最多 5 万行。" />
      <Card className="import-card" bordered={false}>
        <Upload.Dragger {...uploadProps} disabled={isUploading}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽 Excel 文件到这里</p>
          <p className="ant-upload-hint">支持 .xlsx / .xls，单批不超过 5 万行</p>
        </Upload.Dragger>
        {file && !batch && <Button type="primary" icon={<UploadOutlined />} size="large" block loading={isUploading} onClick={() => void handleUpload()} className="import-submit">开始导入</Button>}
        {isUploading && <div className="progress-block"><Typography.Text>正在上传文件...</Typography.Text><Progress percent={progress} status="active" /></div>}
        {batch && <Result status={batch.status === 'succeeded' ? 'success' : 'info'} title={batch.status === 'succeeded' ? '导入完成' : '文件已提交'} subTitle={`批次 ${batch.id}，共 ${batch.totalRows.toLocaleString()} 行`} extra={<Space><Button onClick={() => { setFile(null); setBatch(null); setProgress(0) }}>继续导入</Button><Button type="primary" href="/">查看商品库</Button></Space>} />}
      </Card>
    </section>
  )
}
