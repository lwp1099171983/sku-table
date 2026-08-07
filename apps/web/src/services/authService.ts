import type { LoginRequestDto, LoginResponseDto, MeResponseDto, RegisterAdminRequestDto, RegisterAdminResponseDto, SwitchShopRequestDto } from '@sku-table/shared'
import apiClient from './apiClient'

const ACCESS_TOKEN_KEY = 'sku_table_access_token'

export const authService = {
  async login(payload: LoginRequestDto): Promise<LoginResponseDto> {
    const { data } = await apiClient.post<LoginResponseDto>('/auth/login', payload)
    sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken)
    return data
  },

  async getCurrentUser(): Promise<MeResponseDto> {
    const { data } = await apiClient.get<MeResponseDto>('/auth/me')
    return data
  },

  async switchShop(payload: SwitchShopRequestDto): Promise<MeResponseDto> {
    const { data } = await apiClient.post<MeResponseDto>('/auth/switch-shop', payload)
    return data
  },

  async registerAdmin(payload: RegisterAdminRequestDto): Promise<RegisterAdminResponseDto> {
    const { data } = await apiClient.post<RegisterAdminResponseDto>('/auth/register', payload)
    return data
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout')
    } finally {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    }
  },

  hasToken(): boolean {
    return Boolean(sessionStorage.getItem(ACCESS_TOKEN_KEY))
  },
}
