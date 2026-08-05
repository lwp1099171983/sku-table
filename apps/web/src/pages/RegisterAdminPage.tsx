import { LockOutlined, MailOutlined, UserAddOutlined, UserOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, Card, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { ErrorAlert } from '../components/ErrorAlert'
import { authService } from '../services/authService'
import './RegisterAdminPage.css'

interface RegisterAdminFormValues {
  email: string
  password: string
  confirmPassword: string
  displayName?: string
}

export function RegisterAdminPage() {
  const [form] = Form.useForm<RegisterAdminFormValues>()
  const { message } = AntdApp.useApp()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(values: RegisterAdminFormValues) {
    setError(null)
    setIsSubmitting(true)

    try {
      const { user } = await authService.registerAdmin({
        email: values.email,
        password: values.password,
        displayName: values.displayName?.trim() || undefined,
      })
      form.resetFields()
      message.success(`管理员账号 ${user.email} 已创建。`)
    } catch (requestError) {
      const apiMessage = (requestError as { response?: { data?: { message?: string } } }).response?.data?.message
      setError(apiMessage || '注册失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="content-page narrow-page admin-registration-page">
      <div className="page-heading">
        <div>
          <Typography.Text className="eyebrow">ADMINISTRATION</Typography.Text>
          <Typography.Title level={1}>注册管理员</Typography.Title>
          <Typography.Paragraph type="secondary">新账号会立即启用，并拥有完整管理员权限。</Typography.Paragraph>
        </div>
      </div>
      <Card className="admin-registration-card" bordered={false}>
        <Typography.Title level={3}>新管理员账号</Typography.Title>
        {error && <ErrorAlert message={error} className="admin-registration-alert" />}
        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false} size="large">
          <Form.Item label="邮箱" name="email" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
            <Input prefix={<MailOutlined />} placeholder="name@company.com" autoComplete="email" />
          </Form.Item>
          <Form.Item label="姓名（可选）" name="displayName">
            <Input prefix={<UserOutlined />} placeholder="用于工作台展示" maxLength={100} autoComplete="name" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, min: 8, message: '密码至少需要 8 个字符' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="至少 8 个字符" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label="确认密码"
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  return !value || getFieldValue('password') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="再次输入密码" autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<UserAddOutlined />} loading={isSubmitting}>
            创建管理员账号
          </Button>
        </Form>
      </Card>
    </section>
  )
}
