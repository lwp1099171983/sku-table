import { CloudUploadOutlined, LogoutOutlined, TableOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Layout, Menu, Space, Typography } from 'antd'
import { useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

const { Header, Sider, Content } = Layout

export function AppLayout() {
  const { user, logout, canImport } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const menuItems = useMemo(() => [
    { key: '/', icon: <TableOutlined />, label: '商品库' },
    ...(canImport ? [{ key: '/imports', icon: <CloudUploadOutlined />, label: '导入数据' }] : []),
  ], [canImport])

  return (
    <Layout className="app-layout">
      <Sider breakpoint="lg" collapsedWidth="0" className="app-sider">
        <div className="brand-mark">
          <span className="brand-dot" />
          <span>选品工作台</span>
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
          <Typography.Text className="header-context">团队商品资料库 / v1</Typography.Text>
          <Space size="middle">
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
