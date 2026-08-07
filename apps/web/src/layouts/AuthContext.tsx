import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthUser, PermissionCode, Shop, UserRole } from '@sku-table/shared'
import { authService } from '../services/authService'

interface AuthContextValue {
  user: AuthUser | null
  roles: UserRole[]
  permissions: PermissionCode[]
  shops: Shop[]
  currentShop: Shop | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  switchShop: (shopId: string | null) => Promise<void>
  hasPermission: (permission: PermissionCode) => boolean
  canImportEmployeeWork: boolean
  canDeleteEmployeeWork: boolean
  canImportLedger: boolean
  canDeleteLedger: boolean
  canViewLedger: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [roles, setRoles] = useState<UserRole[]>([])
  const [permissions, setPermissions] = useState<PermissionCode[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [currentShop, setCurrentShop] = useState<Shop | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const clearAuthState = () => {
    setUser(null)
    setRoles([])
    setPermissions([])
    setShops([])
    setCurrentShop(null)
  }

  useEffect(() => {
    const handleUnauthorized = () => clearAuthState()
    window.addEventListener('sku-table:unauthorized', handleUnauthorized)

    if (!authService.hasToken()) {
      setIsLoading(false)
      return () => window.removeEventListener('sku-table:unauthorized', handleUnauthorized)
    }

    authService.getCurrentUser()
      .then((context) => {
        setUser(context.user)
        setRoles(context.roles)
        setPermissions(context.permissions)
        setShops(context.shops)
        setCurrentShop(context.currentShop)
      })
      .catch(() => clearAuthState())
      .finally(() => setIsLoading(false))

    return () => window.removeEventListener('sku-table:unauthorized', handleUnauthorized)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    roles,
    permissions,
    shops,
    currentShop,
    isLoading,
    hasPermission: (permission) => permissions.includes(permission),
    canImportEmployeeWork: permissions.includes('employee_work.import'),
    canDeleteEmployeeWork: permissions.includes('employee_work.delete'),
    canImportLedger: permissions.includes('ledger.import'),
    canDeleteLedger: permissions.includes('ledger.delete'),
    canViewLedger: permissions.includes('ledger.read'),
    isAdmin: roles.includes('admin'),
    async login(email, password) {
      const response = await authService.login({ email, password })
      setUser(response.user)
      setRoles(response.roles)
      setPermissions(response.permissions)
      setShops(response.shops)
      setCurrentShop(response.currentShop)
    },
    async logout() {
      await authService.logout()
      clearAuthState()
    },
    async switchShop(shopId) {
      const response = await authService.switchShop({ shopId })
      setRoles(response.roles)
      setPermissions(response.permissions)
      setShops(response.shops)
      setCurrentShop(response.currentShop)
    },
  }), [isLoading, user, roles, permissions, shops, currentShop])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return context
}
