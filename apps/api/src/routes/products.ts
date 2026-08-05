import { Hono } from 'hono'
import { z } from 'zod'
import type { ProductListQueryDto } from '@sku-table/shared'
import { type AuthEnv, requireAuth, requirePermission } from '../modules/auth/auth.middleware.js'
import { listProducts, updateProductInternalNote } from '../modules/products/product.repository.js'

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
  createdBy: z.string().trim().optional(),
})

const internalNoteSchema = z.object({
  internalNote: z.string().trim().max(2000),
})

export const productRoutes = new Hono<AuthEnv>()

productRoutes.get('/', requireAuth, requirePermission('product.read'), async (context) => {
  const result = listQuerySchema.safeParse(context.req.query())
  if (!result.success) {
    return context.json({ code: 'VALIDATION_ERROR', message: '分页或筛选条件不正确。' }, 400)
  }

  const query: Required<Pick<ProductListQueryDto, 'page' | 'pageSize'>> & Omit<ProductListQueryDto, 'page' | 'pageSize'> = {
    ...result.data,
    createdBy: result.data.createdBy || undefined,
  }
  return context.json(await listProducts({
    studioId: context.get('authContext').currentStudio.id,
    ...query,
  }))
})

productRoutes.patch('/:id/internal-note', requireAuth, requirePermission('product.note.edit'), async (context) => {
  const productId = Number(context.req.param('id'))
  if (!Number.isFinite(productId)) {
    return context.json({ code: 'VALIDATION_ERROR', message: '商品 ID 不正确。' }, 400)
  }

  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return context.json({ code: 'VALIDATION_ERROR', message: '请求体格式不正确。' }, 400)
  }
  const result = internalNoteSchema.safeParse(body)
  if (!result.success) {
    return context.json({ code: 'VALIDATION_ERROR', message: '内部备注格式不正确。' }, 400)
  }

  const product = await updateProductInternalNote({
    studioId: context.get('authContext').currentStudio.id,
    productId,
    internalNote: result.data.internalNote,
  })
  if (!product) {
    return context.json({ code: 'NOT_FOUND', message: '商品不存在。' }, 404)
  }

  return context.json({ product })
})
