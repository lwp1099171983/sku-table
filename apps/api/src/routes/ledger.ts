import { Hono } from 'hono'
import { z } from 'zod'
import { type AuthEnv, requireAuth, requirePermission } from '../modules/auth/auth.middleware.js'
import { parseLedgerFileAsync } from '../modules/ledger/parser.js'
import {
  createLedgerImport,
  deleteLedgerItem,
  deleteLedgerItems,
  listLedgerBatches,
  listLedgerItems,
  ShopAccessForbiddenError,
} from '../modules/ledger/repository.js'
import { readBody, resolveDeleteScope, resolveShopScope } from './helpers.js'

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
  shopId: z.string().trim().min(1).max(100).optional(),
  month: z.string().trim().max(20).optional(),
  keyword: z.string().trim().max(200).optional(),
})

const batchListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  shopId: z.string().trim().min(1).max(100).optional(),
})

const batchDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
  shopId: z.string().trim().min(1).max(100).optional(),
})

export const ledgerRoutes = new Hono<AuthEnv>()

ledgerRoutes.get('/', requireAuth, requirePermission('ledger.read'), async (context) => {
  const result = listQuerySchema.safeParse(context.req.query())
  if (!result.success) {
    return context.json({ code: 'VALIDATION_ERROR', message: '分页或筛选条件不正确。' }, 400)
  }

  const scope = resolveShopScope(context, result.data.shopId)
  if (scope instanceof Response) return scope

  return context.json(await listLedgerItems(scope.shopIds, {
    page: result.data.page,
    pageSize: result.data.pageSize,
    month: result.data.month,
    keyword: result.data.keyword,
  }))
})

ledgerRoutes.get('/batches', requireAuth, requirePermission('ledger.read'), async (context) => {
  const result = batchListQuerySchema.safeParse(context.req.query())
  if (!result.success) {
    return context.json({ code: 'VALIDATION_ERROR', message: '分页参数不正确。' }, 400)
  }

  const scope = resolveShopScope(context, result.data.shopId)
  if (scope instanceof Response) return scope

  return context.json(await listLedgerBatches(scope.shopIds, result.data.page, result.data.pageSize))
})

ledgerRoutes.post('/import', requireAuth, requirePermission('ledger.import'), async (context) => {
  let formData: FormData
  try {
    formData = await context.req.formData()
  } catch {
    return context.json({ code: 'VALIDATION_ERROR', message: '上传请求格式不正确。' }, 400)
  }
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请选择 Excel 文件。' }, 400)
  }

  let items
  try {
    items = await parseLedgerFileAsync(file)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Excel 文件无法解析。'
    return context.json({ code: 'IMPORT_FILE_INVALID', message }, 400)
  }

  if (items.length > 50_000) {
    return context.json({ code: 'VALIDATION_ERROR', message: '导入行数超出允许范围（0~50000）。' }, 400)
  }

  const authContext = context.get('authContext')
  try {
    const batches = await createLedgerImport({
      fileName: file.name || '未命名文件.xlsx',
      uploadedBy: context.get('authUser').id,
      importer: {
        id: context.get('authUser').id,
        isAdmin: authContext.roles.includes('admin'),
        roles: authContext.roles,
      },
      items,
    })
    return context.json({ batches, importedRows: items.length }, 201)
  } catch (error) {
    if (error instanceof ShopAccessForbiddenError) {
      return context.json({ code: 'FORBIDDEN', message: error.message }, 403)
    }
    throw error
  }
})

// 单行删除：仅允许删除自己有删除权限的店铺数据
ledgerRoutes.delete('/items/:id', requireAuth, async (context) => {
  const itemId = Number(context.req.param('id'))
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return context.json({ code: 'VALIDATION_ERROR', message: '记录 ID 不正确。' }, 400)
  }

  const scope = await resolveDeleteScope(context, 'ledger.delete', context.req.query('shopId'))
  if (scope instanceof Response) return scope

  const deleted = await deleteLedgerItem(itemId, scope.shopIds)
  if (deleted === 0) {
    return context.json({ code: 'NOT_FOUND', message: '记录不存在或无权删除。' }, 404)
  }
  return context.json({ deleted })
})

ledgerRoutes.post('/items/batch-delete', requireAuth, async (context) => {
  const body = await readBody(context, batchDeleteSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请提供要删除的记录 ID 列表。' }, 400)
  }

  const scope = await resolveDeleteScope(context, 'ledger.delete', body.shopId)
  if (scope instanceof Response) return scope

  const deleted = await deleteLedgerItems(body.ids, scope.shopIds)
  return context.json({ deleted })
})
