import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { forbidden, type AuthEnv, requireAuth, requirePermission } from '../modules/auth/auth.middleware.js'
import { loadAuthContextForShop } from '../modules/auth/auth.service.js'
import { parseLedgerFileAsync } from '../modules/ledger/parser.js'
import {
  createLedgerImport,
  deleteLedgerItem,
  deleteLedgerItems,
  listLedgerItems,
} from '../modules/ledger/repository.js'

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
  shopId: z.string().trim().min(1).max(100).optional(),
  month: z.string().trim().max(20).optional(),
  keyword: z.string().trim().max(200).optional(),
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

  const authContext = context.get('authContext')
  const accessibleIds = authContext.shops.map((shop) => shop.id)
  if (result.data.shopId && !accessibleIds.includes(result.data.shopId)) {
    return context.json({ code: 'FORBIDDEN', message: '无权访问该店铺数据。' }, 403)
  }
  const shopIds = result.data.shopId ? [result.data.shopId] : (authContext.roles.includes('admin') ? null : accessibleIds)
  return context.json(await listLedgerItems(shopIds, {
    page: result.data.page,
    pageSize: result.data.pageSize,
    month: result.data.month,
    keyword: result.data.keyword,
  }))
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
})

// 解析删除范围并校验删除权限：带 shopId 时按该店铺上下文校验；不带时按默认上下文校验
async function resolveDeleteScope(
  context: Context<AuthEnv>,
  shopId?: string,
): Promise<{ shopIds: string[] | null } | Response> {
  const authUser = context.get('authUser')
  const authContext = context.get('authContext')
  if (shopId) {
    const shopContext = await loadAuthContextForShop(authUser.id, shopId)
    if (!shopContext || !shopContext.permissions.includes('ledger.delete')) {
      return forbidden(context)
    }
    return { shopIds: [shopId] }
  }
  if (!authContext.permissions.includes('ledger.delete')) {
    return forbidden(context)
  }
  return { shopIds: authContext.roles.includes('admin') ? null : authContext.shops.map((shop) => shop.id) }
}

ledgerRoutes.delete('/items/:id', requireAuth, async (context) => {
  const itemId = Number(context.req.param('id'))
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return context.json({ code: 'VALIDATION_ERROR', message: '记录 ID 不正确。' }, 400)
  }

  const scope = await resolveDeleteScope(context, context.req.query('shopId'))
  if (scope instanceof Response) return scope

  const deleted = await deleteLedgerItem(itemId, scope.shopIds)
  if (deleted === 0) {
    return context.json({ code: 'NOT_FOUND', message: '记录不存在或无权删除。' }, 404)
  }
  return context.json({ deleted })
})

ledgerRoutes.post('/items/batch-delete', requireAuth, async (context) => {
  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return context.json({ code: 'VALIDATION_ERROR', message: '请求体格式不正确。' }, 400)
  }
  const result = batchDeleteSchema.safeParse(body)
  if (!result.success) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请提供要删除的记录 ID 列表。' }, 400)
  }

  const scope = await resolveDeleteScope(context, result.data.shopId)
  if (scope instanceof Response) return scope

  const deleted = await deleteLedgerItems(result.data.ids, scope.shopIds)
  return context.json({ deleted })
})
