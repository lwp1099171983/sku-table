import { CalculatorOutlined, LogoutOutlined, MoonOutlined, ScheduleOutlined, SunOutlined, UserAddOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Layout, Menu, Space, Tooltip, Typography } from 'antd'
import { useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { APP_COPY } from '../constants/app'
import { useAuth } from './AuthContext'
import { useTheme } from './ThemeContext'

const { Header, Sider, Content } = Layout

export function AppLayout() {
  const { user, isOwner, logout } = useAuth()
  const { mode, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const menuItems = useMemo(() => [
    { key: '/', icon: <ScheduleOutlined />, label: APP_COPY.employeeWork },
    { key: '/pricing', icon: <CalculatorOutlined />, label: APP_COPY.pricing },
    ...(isOwner ? [{ key: '/admin/register', icon: <UserAddOutlined />, label: APP_COPY.adminRegistration }] : []),
  ], [isOwner])

  const headerContext = location.pathname === '/pricing'
    ? APP_COPY.pricing
    : location.pathname === '/admin/register'
      ? APP_COPY.adminRegistration
      : APP_COPY.employeeWork

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
            <Tooltip title={mode === 'dark' ? '切换浅色主题' : '切换深色主题'}>
              <Button
                type="text"
                icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
                aria-label={mode === 'dark' ? '切换浅色主题' : '切换深色主题'}
              />
            </Tooltip>
            <Space size="small" className="user-chip">
              <Avatar size="small" icon={<UserOutlined />} />
              <span>{user?.email}</span>
            </Space>
            <Button type="text" icon={<LogoutOutlined />} onClick={() => void logout()} aria-label="退出登录">
              退出
            </Button>
          </Space>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
