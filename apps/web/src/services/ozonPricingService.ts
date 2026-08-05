import type { OzonPricingImportResponseDto, OzonPricingListResponseDto } from '@sku-table/shared'
import apiClient from './apiClient'

export const ozonPricingService = {
  async list(params: { page: number; pageSize: number; store?: string; keyword?: string }): Promise<OzonPricingListResponseDto> {
    const { data } = await apiClient.get<OzonPricingListResponseDto>('/ozon-pricing', { params })
    return data
  },

  async importFile(input: { file: File; onProgress?: (progress: number) => void }): Promise<OzonPricingImportResponseDto> {
    const formData = new FormData()
    formData.append('file', input.file)
    const { data } = await apiClient.post<OzonPricingImportResponseDto>('/ozon-pricing/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
      onUploadProgress: (event) => {
        if (event.total) input.onProgress?.(Math.round((event.loaded / event.total) * 100))
      },
    })
    return data
  },
}
