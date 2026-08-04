import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api',
  timeout: 30_000,
})

apiClient.interceptors.request.use((config) => {
  const accessToken = sessionStorage.getItem('sku_table_access_token')
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('sku_table_access_token')
      window.dispatchEvent(new Event('sku-table:unauthorized'))
    }
    return Promise.reject(error)
  },
)

export default apiClient
