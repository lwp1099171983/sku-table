import { Hono } from 'hono'
import { loginRoutes } from './auth.js'
import { adminUserRoutes } from './adminUsers.js'
import { healthRoutes } from './health.js'
import { employeeWorkRoutes } from './employeeWork.js'
import { ledgerRoutes } from './ledger.js'
import { shopRoutes } from './shops.js'
import { shippingRateRoutes } from './shippingRates.js'

export const apiRoutes = new Hono()
  .route('/health', healthRoutes)
  .route('/auth', loginRoutes)
  .route('/employee-work', employeeWorkRoutes)
  .route('/ledger', ledgerRoutes)
  .route('/shops', shopRoutes)
  .route('/admin/users', adminUserRoutes)
  .route('/admin/shipping-rates', shippingRateRoutes)
