import type { ImportBatchResponseDto } from '../types/dto'
import apiClient from './apiClient'

export const importService = {
  async upload(file: File, onProgress?: (progress: number) => void): Promise<ImportBatchResponseDto> {
    const formData = new FormData()
    formData.append('file', file)

    const { data } = await apiClient.post<ImportBatchResponseDto>('/imports', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (event.total) {
          onProgress?.(Math.round((event.loaded / event.total) * 100))
        }
      },
    })
    return data
  },
}
