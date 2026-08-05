import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxy = {
    target: env.API_PROXY_TARGET || 'http://localhost:3000',
    changeOrigin: true,
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@sku-table/shared': new URL('../../packages/shared/src', import.meta.url).pathname,
      },
    },
    // 本地开发和预览通过 Vite 转发 API，正式环境由 Nginx 转发同一路径。
    server: { proxy: { '/api': apiProxy } },
    preview: { proxy: { '/api': apiProxy } },
  }
})
