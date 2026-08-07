import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminRoute } from './components/AdminRoute'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './layouts/AppLayout'
import { EmployeeWorkPage } from './pages/EmployeeWorkPage'
import { LedgerPage } from './pages/LedgerPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterAdminPage } from './pages/RegisterAdminPage'
import { ShopMemberPage } from './pages/ShopMemberPage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<EmployeeWorkPage />} />
          <Route path="ledger" element={<LedgerPage />} />
          <Route element={<AdminRoute />}>
            <Route path="admin/shops" element={<ShopMemberPage />} />
            <Route path="admin/register" element={<RegisterAdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
