import { LogoutOutlined, MoonOutlined, ScheduleOutlined, ShopOutlined, SunOutlined, TableOutlined, UserAddOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Layout, Menu, Select, Space, Tooltip, Typography } from 'antd'
import { useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { APP_COPY } from '../constants/app'
import { useAuth } from './AuthContext'
import { useTheme } from './ThemeContext'

const { Header, Sider, Content } = Layout

const ALL_SHOPS_VALUE = '__all__'

export function AppLayout() {
  const { user, isAdmin, canViewLedger, shops, currentShop, switchShop, logout } = useAuth()
  const { mode, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const menuItems = useMemo(() => [
    { key: '/', icon: <ScheduleOutlined />, label: APP_COPY.employeeWork },
    ...(canViewLedger ? [{ key: '/ledger', icon: <TableOutlined />, label: APP_COPY.ledger }] : []),
    ...(isAdmin ? [
      { key: '/admin/shops', icon: <ShopOutlined />, label: APP_COPY.shopManagement },
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
      : location.pathname === '/ledger'
        ? APP_COPY.ledger
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
