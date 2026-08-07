import type { EmployeeWorkBatch, EmployeeWorkImportResponseDto, EmployeeWorkListResponseDto, PageResult } from '@sku-table/shared'
import apiClient from './apiClient'

export const employeeWorkService = {
  async list(params: { page: number; pageSize: number; shopId?: string | null; employeeName?: string; workDate?: string; sku?: string }): Promise<EmployeeWorkListResponseDto> {
    const { data } = await apiClient.get<EmployeeWorkListResponseDto>('/employee-work', { params })
    return data
  },

  async listBatches(params: { page: number; pageSize: number; shopId?: string | null }): Promise<PageResult<EmployeeWorkBatch>> {
    const { data } = await apiClient.get<PageResult<EmployeeWorkBatch>>('/employee-work/batches', { params })
    return data
  },

  async rollbackBatch(batchId: string): Promise<{ batch: EmployeeWorkBatch }> {
    const { data } = await apiClient.post<{ batch: EmployeeWorkBatch }>(`/employee-work/batches/${batchId}/rollback`)
    return data
  },

  async listEmployees(shopId?: string | null): Promise<string[]> {
    const { data } = await apiClient.get<{ items: string[] }>('/employee-work/employees', { params: { shopId: shopId ?? undefined } })
    return data.items
  },

  async importFile(input: {
    shopId: string
    employeeName: string
    workDate: string
    file: File
    onProgress?: (progress: number) => void
  }): Promise<EmployeeWorkImportResponseDto> {
    const formData = new FormData()
    formData.append('shopId', input.shopId)
    formData.append('employeeName', input.employeeName)
    formData.append('workDate', input.workDate)
    formData.append('file', input.file)

    const { data } = await apiClient.post<EmployeeWorkImportResponseDto>('/employee-work/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
      onUploadProgress: (event) => {
        if (event.total) input.onProgress?.(Math.round((event.loaded / event.total) * 100))
      },
    })
    return data
  },

  async deleteItem(id: number, shopId?: string | null): Promise<{ deleted: number }> {
    const { data } = await apiClient.delete<{ deleted: number }>(`/employee-work/items/${id}`, {
      params: { shopId: shopId ?? undefined },
    })
    return data
  },

  async batchDelete(ids: number[], shopId?: string | null): Promise<{ deleted: number }> {
    const { data } = await apiClient.post<{ deleted: number }>('/employee-work/items/batch-delete', {
      ids,
      shopId: shopId ?? undefined,
    })
    return data
  },
}
