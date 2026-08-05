import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { env } from './config/env.js'

const app = createApp()

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})
