import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../layouts/AuthContext'

export function ProtectedRoute() {
  const { isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <div className="page-state">正在检查登录状态...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
