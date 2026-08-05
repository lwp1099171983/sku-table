import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthUser, Studio, UserRole } from '@sku-table/shared'
import { authService } from '../services/authService'

interface AuthContextValue {
  user: AuthUser | null
  roles: UserRole[]
  permissions: string[]
  studios: Studio[]
  currentStudio: Studio | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  canImport: boolean
  isOwner: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [roles, setRoles] = useState<UserRole[]>([])
  const [permissions, setPermissions] = useState<string[]>([])
  const [studios, setStudios] = useState<Studio[]>([])
  const [currentStudio, setCurrentStudio] = useState<Studio | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const clearAuthState = () => {
    setUser(null)
    setRoles([])
    setPermissions([])
    setStudios([])
    setCurrentStudio(null)
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
        setStudios(context.studios)
        setCurrentStudio(context.currentStudio)
      })
      .catch(() => clearAuthState())
      .finally(() => setIsLoading(false))

    return () => window.removeEventListener('sku-table:unauthorized', handleUnauthorized)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    roles,
    permissions,
    studios,
    currentStudio,
    isLoading,
    canImport: permissions.includes('employee_work.import')
      || permissions.includes('pricing.import')
      || permissions.includes('product.import'),
    isOwner: roles.includes('owner'),
    async login(email, password) {
      const response = await authService.login({ email, password })
      setUser(response.user)
      setRoles(response.roles)
      setPermissions(response.permissions)
      setStudios(response.studios)
      setCurrentStudio(response.currentStudio)
    },
    async logout() {
      await authService.logout()
      clearAuthState()
    },
  }), [isLoading, user, roles, permissions, studios, currentStudio])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return context
}
