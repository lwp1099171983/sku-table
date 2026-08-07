import type { LedgerImportResponseDto, LedgerListResponseDto } from '@sku-table/shared'
import apiClient from './apiClient'

export const ledgerService = {
  async list(params: { page: number; pageSize: number; shopId?: string | null; month?: string; keyword?: string }): Promise<LedgerListResponseDto> {
    const { data } = await apiClient.get<LedgerListResponseDto>('/ledger', { params })
    return data
  },

  async importFile(input: {
    file: File
    onProgress?: (progress: number) => void
  }): Promise<LedgerImportResponseDto> {
    const formData = new FormData()
    formData.append('file', input.file)

    const { data } = await apiClient.post<LedgerImportResponseDto>('/ledger/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
      onUploadProgress: (event) => {
        if (event.total) input.onProgress?.(Math.round((event.loaded / event.total) * 100))
      },
    })
    return data
  },

  async deleteItem(id: number, shopId?: string | null): Promise<{ deleted: number }> {
    const { data } = await apiClient.delete<{ deleted: number }>(`/ledger/items/${id}`, {
      params: { shopId: shopId ?? undefined },
    })
    return data
  },

  async batchDelete(ids: number[], shopId?: string | null): Promise<{ deleted: number }> {
    const { data } = await apiClient.post<{ deleted: number }>('/ledger/items/batch-delete', {
      ids,
      shopId: shopId ?? undefined,
    })
    return data
  },
}
