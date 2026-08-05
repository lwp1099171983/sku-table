import type { EmployeeWorkImportResponseDto, EmployeeWorkListResponseDto } from '@sku-table/shared'
import apiClient from './apiClient'

export const employeeWorkService = {
  async list(params: { page: number; pageSize: number; employeeName?: string; workDate?: string; sku?: string }): Promise<EmployeeWorkListResponseDto> {
    const { data } = await apiClient.get<EmployeeWorkListResponseDto>('/employee-work', { params })
    return data
  },

  async listEmployees(): Promise<string[]> {
    const { data } = await apiClient.get<{ items: string[] }>('/employee-work/employees')
    return data.items
  },

  async importFile(input: {
    employeeName: string
    workDate: string
    file: File
    onProgress?: (progress: number) => void
  }): Promise<EmployeeWorkImportResponseDto> {
    const formData = new FormData()
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
}
