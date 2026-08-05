import { Hono } from 'hono'
import { healthRoutes } from './health.js'

export const apiRoutes = new Hono().route('/health', healthRoutes)
