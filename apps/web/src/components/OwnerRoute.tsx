import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../layouts/AuthContext'

export function OwnerRoute() {
  const { isLoading, isOwner } = useAuth()

  if (isLoading) {
    return <div className="page-state">正在检查登录状态...</div>
  }

  if (!isOwner) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
