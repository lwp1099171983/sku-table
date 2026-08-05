import type { ProductListQueryDto, ProductListResponseDto, UpdateInternalNoteRequestDto } from '@sku-table/shared'
import apiClient from './apiClient'

export const productService = {
  async list(query: ProductListQueryDto): Promise<ProductListResponseDto> {
    const { data } = await apiClient.get<ProductListResponseDto>('/products', { params: query })
    return data
  },

  async updateInternalNote(productId: number, payload: UpdateInternalNoteRequestDto): Promise<void> {
    await apiClient.patch(`/products/${productId}/internal-note`, payload)
  },
}
