import { Hono } from 'hono'
import { loginRoutes } from './auth.js'
import { healthRoutes } from './health.js'
import { employeeWorkRoutes } from './employeeWork.js'
import { pricingRoutes } from './pricing.js'
import { productRoutes } from './products.js'
import { importRoutes } from './imports.js'
import { studioRoutes } from './studios.js'
import { userRoutes } from './users.js'

export const apiRoutes = new Hono()
  .route('/health', healthRoutes)
  .route('/auth', loginRoutes)
  .route('/employee-work', employeeWorkRoutes)
  .route('/pricing', pricingRoutes)
  .route('/products', productRoutes)
  .route('/imports', importRoutes)
  .route('/studios', studioRoutes)
  .route('/users', userRoutes)
