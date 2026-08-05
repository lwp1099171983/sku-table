import { Hono } from 'hono'
import { loginRoutes } from './auth.js'
import { healthRoutes } from './health.js'
import { employeeWorkRoutes } from './employeeWork.js'
import { pricingRoutes } from './pricing.js'

export const apiRoutes = new Hono()
  .route('/health', healthRoutes)
  .route('/auth', loginRoutes)
  .route('/employee-work', employeeWorkRoutes)
  .route('/pricing', pricingRoutes)
