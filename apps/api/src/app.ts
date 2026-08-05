import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { errorHandler } from './middleware/errorHandler.js'
import { apiRoutes } from './routes/index.js'

export function createApp() {
  const app = new Hono().basePath('/api')

  app.use('*', cors())
  app.onError(errorHandler)
  app.route('/', apiRoutes)

  return app
}
