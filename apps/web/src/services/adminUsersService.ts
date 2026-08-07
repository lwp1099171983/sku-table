import type { AdminUserDto, AdminUserListResponseDto, SetUserActiveRequestDto } from '@sku-table/shared'
import apiClient from './apiClient'

export const adminUsersService = {
  async listUsers(): Promise<AdminUserDto[]> {
    const { data } = await apiClient.get<AdminUserListResponseDto>('/admin/users')
    return data.items
  },

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    await apiClient.post(`/admin/users/${userId}/reset-password`, { newPassword })
  },

  async setActive(userId: string, payload: SetUserActiveRequestDto): Promise<void> {
    await apiClient.patch(`/admin/users/${userId}/status`, payload)
  },
}
