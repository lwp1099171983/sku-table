import { Hono } from 'hono'
import { z } from 'zod'
import type { EmployeeWorkListQueryDto } from '@sku-table/shared'
import { type AuthEnv, requireAuth, requirePermission } from '../modules/auth/auth.middleware.js'
import { parseEmployeeWorkFileAsync } from '../modules/employee-work/parser.js'
import {
  createEmployeeWorkImport,
  deleteEmployeeWorkItem,
  deleteEmployeeWorkItems,
  listEmployeeNames,
  listEmployeeWorkBatches,
  listEmployeeWorkItems,
  rollbackEmployeeWorkBatch,
} from '../modules/employee-work/repository.js'
import { readBody, resolveDeleteScope, resolveShopScope } from './helpers.js'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '工作日期格式不正确。')

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
  shopId: z.string().trim().min(1).max(100).optional(),
  employeeName: z.string().trim().max(100).optional(),
  workDate: dateSchema.optional(),
  sku: z.string().trim().max(200).optional(),
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

function isValidDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const employeeWorkRoutes = new Hono<AuthEnv>()

employeeWorkRoutes.get('/', requireAuth, async (context) => {
  const rawQuery = context.req.query()
  const result = listQuerySchema.safeParse(rawQuery)
  if (!result.success || (result.data.workDate && !isValidDate(result.data.workDate))) {
    return context.json({ code: 'VALIDATION_ERROR', message: '分页或筛选条件不正确。' }, 400)
  }

  const scope = await resolveShopScope(context, result.data.shopId, 'employee_work.read')
  if (scope instanceof Response) return scope

  const query: Required<Pick<EmployeeWorkListQueryDto, 'page' | 'pageSize'>> & Omit<EmployeeWorkListQueryDto, 'page' | 'pageSize'> = {
    page: result.data.page,
    pageSize: result.data.pageSize,
    employeeName: result.data.employeeName || undefined,
    workDate: result.data.workDate,
    sku: result.data.sku || undefined,
  }
  return context.json(await listEmployeeWorkItems(scope.shopIds, query))
})

employeeWorkRoutes.get('/batches', requireAuth, async (context) => {
  const result = batchListQuerySchema.safeParse(context.req.query())
  if (!result.success) {
    return context.json({ code: 'VALIDATION_ERROR', message: '分页参数不正确。' }, 400)
  }

  const scope = await resolveShopScope(context, result.data.shopId, 'employee_work.read')
  if (scope instanceof Response) return scope

  return context.json(await listEmployeeWorkBatches(scope.shopIds, result.data.page, result.data.pageSize))
})

// 按批次回滚：仅管理员（employee_work.rollback），回滚后默认列表不再展示该批次明细
employeeWorkRoutes.post('/batches/:id/rollback', requireAuth, requirePermission('employee_work.rollback'), async (context) => {
  const batchId = context.req.param('id')
  if (!batchId) {
    return context.json({ code: 'VALIDATION_ERROR', message: '批次 ID 不正确。' }, 400)
  }
  const batch = await rollbackEmployeeWorkBatch(batchId, context.get('authUser').id)
  if (!batch) {
    return context.json({ code: 'NOT_FOUND', message: '批次不存在或已回滚。' }, 404)
  }
  return context.json({ batch })
})

employeeWorkRoutes.get('/employees', requireAuth, async (context) => {
  const scope = await resolveShopScope(context, context.req.query('shopId'), 'employee_work.read')
  if (scope instanceof Response) return scope
  return context.json({ items: await listEmployeeNames(scope.shopIds) })
})

employeeWorkRoutes.post('/import', requireAuth, requirePermission('employee_work.import'), async (context) => {
  let formData: FormData
  try {
    formData = await context.req.formData()
  } catch {
    return context.json({ code: 'VALIDATION_ERROR', message: '上传请求格式不正确。' }, 400)
  }
  const employeeName = String(formData.get('employeeName') ?? '').trim()
  const workDate = String(formData.get('workDate') ?? '').trim()
  const shopId = String(formData.get('shopId') ?? '').trim()
  const file = formData.get('file')

  if (employeeName.length < 1 || employeeName.length > 100 || !dateSchema.safeParse(workDate).success || !isValidDate(workDate)) {
    return context.json({ code: 'VALIDATION_ERROR', message: '员工姓名或工作日期不正确。' }, 400)
  }
  if (!(file instanceof File)) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请选择 Excel 文件。' }, 400)
  }

  let items
  try {
    items = await parseEmployeeWorkFileAsync(file)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Excel 文件无法解析。'
    return context.json({ code: 'IMPORT_FILE_INVALID', message }, 400)
  }

  // 防御性校验：行数须在 0~50000（length 恒非负，仅需兜底上限）
  if (items.length > 50_000) {
    return context.json({ code: 'VALIDATION_ERROR', message: '导入行数超出允许范围（0~50000）。' }, 400)
  }

  // shopId 必须属于当前用户可访问店铺；员工工作 Excel 没有店铺列，导入必须归属具体店铺
  const authContext = context.get('authContext')
  const accessibleIds = authContext.shops.map((shop) => shop.id)
  if (!shopId || !accessibleIds.includes(shopId)) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请先选择具体店铺再导入员工工作数据。' }, 400)
  }

  const { batch, importedRows, skippedRows, reused } = await createEmployeeWorkImport({
    shopId,
    employeeName,
    workDate,
    fileName: file.name || '未命名文件.xlsx',
    uploadedBy: context.get('authUser').id,
    items,
  })

  return context.json({ batch, importedRows, skippedRows, reused }, reused ? 200 : 201)
})

// 单行删除：仅允许删除自己有删除权限的店铺数据
employeeWorkRoutes.delete('/items/:id', requireAuth, async (context) => {
  const itemId = Number(context.req.param('id'))
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return context.json({ code: 'VALIDATION_ERROR', message: '记录 ID 不正确。' }, 400)
  }

  const scope = await resolveDeleteScope(context, 'employee_work.delete', context.req.query('shopId'))
  if (scope instanceof Response) return scope

  const deleted = await deleteEmployeeWorkItem(itemId, scope.shopIds)
  if (deleted === 0) {
    return context.json({ code: 'NOT_FOUND', message: '记录不存在或无权删除。' }, 404)
  }
  return context.json({ deleted })
})

// 批量删除
employeeWorkRoutes.post('/items/batch-delete', requireAuth, async (context) => {
  const body = await readBody(context, batchDeleteSchema)
  if (!body) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请提供要删除的记录 ID 列表。' }, 400)
  }

  const scope = await resolveDeleteScope(context, 'employee_work.delete', body.shopId)
  if (scope instanceof Response) return scope

  const deleted = await deleteEmployeeWorkItems(body.ids, scope.shopIds)
  return context.json({ deleted })
})
