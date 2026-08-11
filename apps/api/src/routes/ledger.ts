import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { forbidden, type AuthEnv, requireAuth, requirePermission } from '../modules/auth/auth.middleware.js'
import { loadAuthContextForShop } from '../modules/auth/auth.service.js'
import { LedgerCalculationError } from '../modules/ledger/calculation.js'
import { parseLedgerFileAsync } from '../modules/ledger/parser.js'
import {
  createLedgerImport,
  deleteLedgerItem,
  deleteLedgerItems,
  getLedgerItemShopId,
  listLedgerBatches,
  listLedgerItems,
  ShopAccessForbiddenError,
  updateLedgerItemWeight,
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

const updateWeightSchema = z.object({
  packageWeight: z.number().finite().nonnegative(),
})

type LogLevel = 'info' | 'warn' | 'error'

function logLedgerImport(
  context: Context<AuthEnv>,
  level: LogLevel,
  details: Record<string, unknown>,
) {
  const write = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  write(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'ledger_import',
    level,
    userId: context.get('authUser').id,
    ...details,
  }))
}

export const ledgerRoutes = new Hono<AuthEnv>()

ledgerRoutes.get('/', requireAuth, async (context) => {
  const result = listQuerySchema.safeParse(context.req.query())
  if (!result.success) {
    return context.json({ code: 'VALIDATION_ERROR', message: '分页或筛选条件不正确。' }, 400)
  }

  const scope = await resolveShopScope(context, result.data.shopId, 'ledger.read')
  if (scope instanceof Response) return scope

  const canViewStats = context.get('authContext').permissions.includes('ledger.stats.read')
  return context.json(await listLedgerItems(scope.shopIds, {
    page: result.data.page,
    pageSize: result.data.pageSize,
    month: result.data.month,
    keyword: result.data.keyword,
  }, canViewStats))
})

ledgerRoutes.get('/batches', requireAuth, async (context) => {
  const result = batchListQuerySchema.safeParse(context.req.query())
  if (!result.success) {
    return context.json({ code: 'VALIDATION_ERROR', message: '分页参数不正确。' }, 400)
  }

  const scope = await resolveShopScope(context, result.data.shopId, 'ledger.read')
  if (scope instanceof Response) return scope

  return context.json(await listLedgerBatches(scope.shopIds, result.data.page, result.data.pageSize))
})

ledgerRoutes.post('/import', requireAuth, requirePermission('ledger.import'), async (context) => {
  const startedAt = Date.now()
  let formData: FormData
  try {
    formData = await context.req.formData()
  } catch {
    logLedgerImport(context, 'warn', {
      result: 'rejected',
      reason: 'invalid_multipart',
      durationMs: Date.now() - startedAt,
    })
    return context.json({ code: 'VALIDATION_ERROR', message: '上传请求格式不正确。' }, 400)
  }
  const file = formData.get('file')
  if (!(file instanceof File)) {
    logLedgerImport(context, 'warn', {
      result: 'rejected',
      reason: 'missing_file',
      durationMs: Date.now() - startedAt,
    })
    return context.json({ code: 'VALIDATION_ERROR', message: '请选择 Excel 文件。' }, 400)
  }

  const fileDetails = {
    fileName: file.name || '未命名文件.xlsx',
    fileSize: file.size,
  }
  logLedgerImport(context, 'info', {
    result: 'received',
    ...fileDetails,
  })

  let items
  try {
    items = await parseLedgerFileAsync(file)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Excel 文件无法解析。'
    logLedgerImport(context, 'warn', {
      result: 'rejected',
      reason: 'parse_failed',
      errorMessage: message,
      ...fileDetails,
      durationMs: Date.now() - startedAt,
    })
    return context.json({ code: 'IMPORT_FILE_INVALID', message }, 400)
  }

  if (items.length > 50_000) {
    logLedgerImport(context, 'warn', {
      result: 'rejected',
      reason: 'too_many_rows',
      parsedRows: items.length,
      ...fileDetails,
      durationMs: Date.now() - startedAt,
    })
    return context.json({ code: 'VALIDATION_ERROR', message: '导入行数超出允许范围（0~50000）。' }, 400)
  }

  const parsedDetails = {
    parsedRows: items.length,
    shopCount: new Set(items.map((item) => item.shopName)).size,
  }
  logLedgerImport(context, 'info', {
    result: 'parsed',
    ...fileDetails,
    ...parsedDetails,
  })

  const authContext = context.get('authContext')
  try {
    const { batches, importedRows, skippedRows, reused } = await createLedgerImport({
      fileName: file.name || '未命名文件.xlsx',
      uploadedBy: context.get('authUser').id,
      importer: {
        id: context.get('authUser').id,
        isAdmin: authContext.roles.includes('admin'),
        roles: authContext.roles,
      },
      items,
    })
    logLedgerImport(context, 'info', {
      result: 'success',
      ...fileDetails,
      ...parsedDetails,
      importedRows,
      skippedRows,
      reused,
      batchIds: batches.map((batch) => batch.id),
      durationMs: Date.now() - startedAt,
    })
    return context.json({ batches, importedRows, skippedRows, reused }, reused ? 200 : 201)
  } catch (error) {
    if (error instanceof ShopAccessForbiddenError) {
      logLedgerImport(context, 'warn', {
        result: 'rejected',
        reason: 'shop_forbidden',
        errorMessage: error.message,
        ...fileDetails,
        ...parsedDetails,
        durationMs: Date.now() - startedAt,
      })
      return context.json({ code: 'FORBIDDEN', message: error.message }, 403)
    }
    logLedgerImport(context, 'error', {
      result: 'failed',
      reason: 'database_or_internal_error',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : '未知错误',
      ...fileDetails,
      ...parsedDetails,
      durationMs: Date.now() - startedAt,
    })
    throw error
  }
})

ledgerRoutes.patch('/items/:id/weight', requireAuth, async (context) => {
  const itemId = Number(context.req.param('id'))
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return context.json({ code: 'VALIDATION_ERROR', message: '记录 ID 不正确。' }, 400)
  }
  const body = await readBody(context, updateWeightSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '包裹重量必须是大于等于 0 的数字。' }, 400)
  }

  const shopId = await getLedgerItemShopId(itemId)
  if (!shopId) {
    return context.json({ code: 'NOT_FOUND', message: '记录不存在。' }, 404)
  }
  const shopContext = await loadAuthContextForShop(context.get('authUser').id, shopId)
  if (!shopContext?.permissions.includes('ledger.edit')) {
    return forbidden(context)
  }

  try {
    const item = await updateLedgerItemWeight(itemId, body.packageWeight)
    if (!item) {
      return context.json({ code: 'NOT_FOUND', message: '记录不存在。' }, 404)
    }
    return context.json({ item })
  } catch (error) {
    if (error instanceof LedgerCalculationError) {
      return context.json({ code: 'LEDGER_CALCULATION_ERROR', message: error.message }, 422)
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
