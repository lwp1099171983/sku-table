import { IdcardOutlined, KeyOutlined, LogoutOutlined, MoonOutlined, ScheduleOutlined, ShopOutlined, SunOutlined, TableOutlined, UserAddOutlined, UserOutlined } from '@ant-design/icons'
import { App as AntdApp, Avatar, Button, Dropdown, Form, Input, Layout, Menu, Modal, Select, Space, Tooltip, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { APP_COPY } from '../constants/app'
import { useAuth } from './AuthContext'
import { useTheme } from './ThemeContext'
import { authService } from '../services/authService'

const { Header, Sider, Content } = Layout

const ALL_SHOPS_VALUE = '__all__'

export function AppLayout() {
  const { user, isAdmin, canViewLedger, shops, currentShop, switchShop, logout } = useAuth()
  const { mode, toggleTheme } = useTheme()
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
  const [changePasswordForm] = Form.useForm<{ oldPassword: string; newPassword: string; confirmPassword: string }>()
  const [isSaving, setIsSaving] = useState(false)

  const menuItems = useMemo(() => [
    { key: '/', icon: <ScheduleOutlined />, label: APP_COPY.employeeWork },
    ...(canViewLedger ? [{ key: '/ledger', icon: <TableOutlined />, label: APP_COPY.ledger }] : []),
    ...(isAdmin ? [
      { key: '/admin/shops', icon: <ShopOutlined />, label: APP_COPY.shopManagement },
      { key: '/admin/users', icon: <IdcardOutlined />, label: APP_COPY.accountManagement },
      { key: '/admin/register', icon: <UserAddOutlined />, label: APP_COPY.adminRegistration },
    ] : []),
  ], [canViewLedger, isAdmin])

  // 管理员始终显示店铺切换器（含"全部"）；成员仅在有多个店铺时显示
  const showShopSwitcher = isAdmin || shops.length > 1

  const shopOptions = useMemo(() => {
    const options = shops.map((shop) => ({ value: shop.id, label: shop.name }))
    if (isAdmin) {
      options.unshift({ value: ALL_SHOPS_VALUE, label: APP_COPY.allShops })
    }
    return options
  }, [isAdmin, shops])

  const currentShopValue = currentShop?.id ?? ALL_SHOPS_VALUE

  const headerContext = location.pathname === '/admin/register'
    ? APP_COPY.adminRegistration
    : location.pathname === '/admin/shops'
      ? APP_COPY.shopManagement
      : location.pathname === '/admin/users'
        ? APP_COPY.accountManagement
        : location.pathname === '/ledger'
          ? APP_COPY.ledger
          : APP_COPY.employeeWork

  async function handleChangePassword() {
    const values = await changePasswordForm.validateFields()
    setIsSaving(true)
    try {
      await authService.changePassword({ oldPassword: values.oldPassword, newPassword: values.newPassword })
      message.success('密码已修改。')
      setIsChangePasswordOpen(false)
      changePasswordForm.resetFields()
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      message.error(apiMessage || '密码修改失败。')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Layout className="app-layout">
      <Sider breakpoint="lg" collapsedWidth="0" className="app-sider">
        <div className="brand-mark">
          <span className="brand-dot" />
          <span>{APP_COPY.name}</span>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Typography.Text className="header-context">{headerContext}</Typography.Text>
          <Space size="middle">
            {showShopSwitcher && (
              <Select
                className="shop-switcher"
                value={currentShopValue}
                options={shopOptions}
                onChange={(value) => void switchShop(value === ALL_SHOPS_VALUE ? null : value)}
                aria-label="切换店铺"
              />
            )}
            <Tooltip title={mode === 'dark' ? '切换浅色主题' : '切换深色主题'}>
              <Button
                type="text"
                icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
                aria-label={mode === 'dark' ? '切换浅色主题' : '切换深色主题'}
              />
            </Tooltip>
            <Dropdown
              placement="bottomRight"
              menu={{
                items: [
                  { key: 'change-password', icon: <KeyOutlined />, label: '修改密码' },
                  { type: 'divider' },
                  { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' },
                ],
                onClick: ({ key }) => {
                  if (key === 'change-password') {
                    setIsChangePasswordOpen(true)
                  } else if (key === 'logout') {
                    void logout()
                  }
                },
              }}
            >
              <Space size="small" className="user-chip" style={{ cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} />
                <span>{user?.email}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>

      <Modal
        title="修改密码"
        open={isChangePasswordOpen}
        onCancel={() => setIsChangePasswordOpen(false)}
        onOk={() => void handleChangePassword()}
        confirmLoading={isSaving}
        okText="保存"
        cancelText="取消"
      >
        <Form form={changePasswordForm} layout="vertical" requiredMark={false}>
          <Form.Item label="当前密码" name="oldPassword" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item label="新密码" name="newPassword" rules={[{ required: true, min: 8, message: '新密码至少需要 8 个字符' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}
