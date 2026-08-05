import { Hono } from 'hono'

export const healthRoutes = new Hono().get('/', (context) => context.json({ status: 'ok' }))
