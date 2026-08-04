import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { AppUser, UserRole } from '../types/type'
import { authService } from '../services/authService'

interface AuthContextValue {
  user: AppUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  canImport: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function toAppUser(user: { id: string; email: string; displayName: string | null; role: UserRole }): AppUser {
  return {
    ...user,
    isActive: true,
    createdAt: '',
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const handleUnauthorized = () => setUser(null)
    window.addEventListener('sku-table:unauthorized', handleUnauthorized)

    if (!authService.hasToken()) {
      setIsLoading(false)
      return () => window.removeEventListener('sku-table:unauthorized', handleUnauthorized)
    }

    authService.getCurrentUser()
      .then(({ user: currentUser }) => setUser(toAppUser(currentUser)))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))

    return () => window.removeEventListener('sku-table:unauthorized', handleUnauthorized)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    canImport: user?.role === 'owner' || user?.role === 'selector',
    async login(email, password) {
      const response = await authService.login({ email, password })
      setUser(toAppUser(response.user))
    },
    async logout() {
      await authService.logout()
      setUser(null)
    },
  }), [isLoading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return context
}
