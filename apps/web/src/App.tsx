import { Navigate, Route, Routes } from 'react-router-dom'
import { OwnerRoute } from './components/OwnerRoute'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './layouts/AppLayout'
import { EmployeeWorkPage } from './pages/EmployeeWorkPage'
import { LoginPage } from './pages/LoginPage'
import { PricingPage } from './pages/PricingPage'
import { RegisterAdminPage } from './pages/RegisterAdminPage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<EmployeeWorkPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route element={<OwnerRoute />}>
            <Route path="admin/register" element={<RegisterAdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
