import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { Button, Card, Checkbox, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ErrorAlert } from '../components/ErrorAlert'
import { APP_LABELS } from '../constants/app'
import { useAuth } from '../layouts/AuthContext'
import './LoginPage.css'

const REMEMBERED_EMAIL_KEY = 'sku_table_remembered_email'

interface LoginFormValues {
  email: string
  password: string
  remember?: boolean
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(values: LoginFormValues) {
    setError(null)
    setIsSubmitting(true)
    try {
      await login(values.email, values.password)
      if (values.remember) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, values.email)
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY)
      }
      const from = (location.state as { from?: string } | null)?.from ?? '/'
      navigate(from, { replace: true })
    } catch {
      setError('登录失败，请检查邮箱、密码或成员状态。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="brand-mark brand-mark-light"><span className="brand-dot" /><span>{APP_LABELS.name}</span></div>
        <Typography.Title>把选品资料，<br /><span>放在同一张桌上。</span></Typography.Title>
        <Typography.Paragraph>
          统一管理商品资料，保留每次导入的来源，让团队把时间用在跟进和判断上。
        </Typography.Paragraph>
        <div className="intro-rule" />
        <Typography.Text className="intro-caption">{APP_LABELS.englishName} / 01</Typography.Text>
      </section>
      <section className="login-panel">
        <Card bordered={false} className="login-card">
          <Typography.Text className="eyebrow">成员登录</Typography.Text>
          <Typography.Title level={2}>欢迎回来</Typography.Title>
          <Typography.Paragraph type="secondary">使用管理员开通的团队账号继续工作。</Typography.Paragraph>
          {error && <ErrorAlert message={error} className="login-alert" />}
          <Form
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark={false}
            size="large"
            initialValues={{
              email: localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '',
              remember: Boolean(localStorage.getItem(REMEMBERED_EMAIL_KEY)),
            }}
          >
            <Form.Item label="邮箱" name="email" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
              <Input prefix={<MailOutlined />} placeholder="name@company.com" autoComplete="email" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
            </Form.Item>
            <Form.Item name="remember" valuePropName="checked">
              <Checkbox>记住账号</Checkbox>
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={isSubmitting}>进入工作台</Button>
          </Form>
          <Typography.Paragraph className="login-footnote" type="secondary">管理员可在工作台注册管理员账号。</Typography.Paragraph>
        </Card>
      </section>
    </main>
  )
}
