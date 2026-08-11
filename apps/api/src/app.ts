import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { errorHandler } from './middleware/errorHandler.js'
import { apiRoutes } from './routes/index.js'

export function createApp() {
  const app = new Hono().basePath('/api')

  app.use('*', cors())
  app.use('*', async (context, next) => {
    const startedAt = Date.now()
    let status = 500
    try {
      await next()
      status = context.res.status
    } finally {
      // 健康检查频率高，成功时不写日志，避免淹没业务请求。
      if (context.req.path !== '/api/health' || status >= 400) {
        console.info(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: 'api_request',
          method: context.req.method,
          path: context.req.path,
          status,
          durationMs: Date.now() - startedAt,
        }))
      }
    }
  })
  app.onError(errorHandler)
  app.route('/', apiRoutes)

  return app
}
