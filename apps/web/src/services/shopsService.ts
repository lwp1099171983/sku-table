import type { CreateShopRequestDto, CreateShopResponseDto, ShopMemberDto, ShopMemberListResponseDto } from '@sku-table/shared'
import apiClient from './apiClient'

export const shopsService = {
  async createShop(payload: CreateShopRequestDto): Promise<CreateShopResponseDto> {
    const { data } = await apiClient.post<CreateShopResponseDto>('/shops', payload)
    return data
  },

  async deleteShop(shopId: string): Promise<void> {
    await apiClient.delete(`/shops/${shopId}`)
  },

  async listMembers(shopId: string): Promise<ShopMemberDto[]> {
    const { data } = await apiClient.get<ShopMemberListResponseDto>(`/shops/${shopId}/members`)
    return data.items
  },

  async addMember(shopId: string, payload: { email: string; displayName?: string; password?: string; roles?: string[] }): Promise<ShopMemberDto> {
    const { data } = await apiClient.post<{ member: ShopMemberDto }>(`/shops/${shopId}/members`, payload)
    return data.member
  },

  async updateMember(shopId: string, userId: string, payload: { roles?: string[]; isActive?: boolean }): Promise<ShopMemberDto> {
    const { data } = await apiClient.patch<{ member: ShopMemberDto }>(`/shops/${shopId}/members/${userId}`, payload)
    return data.member
  },

  async setMemberPermission(shopId: string, userId: string, payload: { permissionCode: 'employee_work.delete' | 'ledger.edit' | 'ledger.delete'; effect: 'allow' | 'deny' | null }): Promise<ShopMemberDto> {
    const { data } = await apiClient.put<{ member: ShopMemberDto }>(`/shops/${shopId}/members/${userId}/permissions`, payload)
    return data.member
  },

  async removeMember(shopId: string, userId: string): Promise<void> {
    await apiClient.delete(`/shops/${shopId}/members/${userId}`)
  },
}
