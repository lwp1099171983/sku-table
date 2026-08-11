import type {
  ImportShippingRatesResponseDto,
  ShippingRateVersionDetailResponseDto,
  ShippingRateVersionListResponseDto,
} from '@sku-table/shared'
import apiClient from './apiClient'

export const shippingRatesService = {
  async listVersions() {
    const { data } = await apiClient.get<ShippingRateVersionListResponseDto>('/admin/shipping-rates/versions')
    return data.items
  },

  async getVersionDetail(versionId: string) {
    const { data } = await apiClient.get<ShippingRateVersionDetailResponseDto>(`/admin/shipping-rates/versions/${versionId}`)
    return data
  },

  async importFile(input: { versionName: string; file: File }) {
    const formData = new FormData()
    formData.append('versionName', input.versionName)
    formData.append('file', input.file)
    const { data } = await apiClient.post<ImportShippingRatesResponseDto>('/admin/shipping-rates/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    })
    return data.version
  },

  async activateVersion(versionId: string) {
    await apiClient.post(`/admin/shipping-rates/versions/${versionId}/activate`)
  },
}
