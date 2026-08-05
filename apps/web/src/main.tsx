import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { App } from './App'
import { AuthProvider } from './layouts/AuthContext'
import { ThemeProvider, useTheme } from './layouts/ThemeContext'
import './styles/global.css'

function ThemedApp() {
  const { mode } = useTheme()

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: 'sku-table-theme' },
        token: {
          colorPrimary: '#e8643b',
          colorInfo: '#3f7cac',
          colorBgBase: mode === 'dark' ? '#101821' : '#f4f6f8',
          colorTextBase: mode === 'dark' ? '#edf3f7' : '#182538',
          borderRadius: 6,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  </StrictMode>,
)
