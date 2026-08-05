import type { ErrorHandler } from 'hono'

export const errorHandler: ErrorHandler = (error, context) => {
  console.error(error)
  return context.json({ code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试。' }, 500)
}
