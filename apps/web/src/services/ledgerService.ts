import type { LedgerBatch, LedgerImportResponseDto, LedgerListResponseDto, PageResult, UpdateLedgerPurchaseAmountResponseDto, UpdateLedgerWeightResponseDto } from '@sku-table/shared'
import apiClient from './apiClient'

export const ledgerService = {
  async list(params: { page: number; pageSize: number; shopId?: string | null; startMonth?: string; endMonth?: string; keyword?: string; sku?: string; netProfitLoss?: boolean; ad22NetLoss?: boolean; ad30NetLoss?: boolean; status?: 'active' | 'deleted' }): Promise<LedgerListResponseDto> {
    const { data } = await apiClient.get<LedgerListResponseDto>('/ledger', { params })
    return data
  },

  async listBatches(params: { page: number; pageSize: number; shopId?: string | null }): Promise<PageResult<LedgerBatch>> {
    const { data } = await apiClient.get<PageResult<LedgerBatch>>('/ledger/batches', { params })
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

  async restoreItem(id: number): Promise<{ restored: number }> {
    const { data } = await apiClient.post<{ restored: number }>(`/ledger/items/${id}/restore`)
    return data
  },

  async updateWeight(id: number, packageWeight: number): Promise<UpdateLedgerWeightResponseDto> {
    const { data } = await apiClient.patch<UpdateLedgerWeightResponseDto>(`/ledger/items/${id}/weight`, { packageWeight })
    return data
  },

  async updatePurchaseAmount(id: number, purchaseAmount: string): Promise<UpdateLedgerPurchaseAmountResponseDto> {
    const { data } = await apiClient.patch<UpdateLedgerPurchaseAmountResponseDto>(`/ledger/items/${id}/purchase-amount`, { purchaseAmount })
    return data
  },
}
