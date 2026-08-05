import type { AppUser } from '@sku-table/shared'
import apiClient from './apiClient'

export const userService = {
  async listActiveMembers(): Promise<AppUser[]> {
    const { data } = await apiClient.get<{ items: AppUser[] }>('/users', {
      params: { activeOnly: true },
    })
    return data.items
  },
}
