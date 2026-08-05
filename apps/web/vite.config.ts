import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@sku-table/shared': new URL('../../packages/shared/src', import.meta.url).pathname,
    },
  },
})
