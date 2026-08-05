import { Hono } from 'hono'
import { z } from 'zod'
import type { EmployeeWorkListQueryDto } from '@sku-table/shared'
import { type AuthEnv, requireAuth, requirePermission } from '../modules/auth/auth.middleware.js'
import { parseEmployeeWorkFileAsync } from '../modules/employee-work/parser.js'
import { createEmployeeWorkImport, listEmployeeNames, listEmployeeWorkItems } from '../modules/employee-work/repository.js'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '工作日期格式不正确。')

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
  employeeName: z.string().trim().max(100).optional(),
  workDate: dateSchema.optional(),
  sku: z.string().trim().max(200).optional(),
  cursor: z.string().trim().max(200).optional(),
})

function isValidDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const employeeWorkRoutes = new Hono<AuthEnv>()

employeeWorkRoutes.get('/', requireAuth, requirePermission('employee_work.read'), async (context) => {
  const rawQuery = context.req.query()
  const result = listQuerySchema.safeParse(rawQuery)
  if (!result.success || (result.data.workDate && !isValidDate(result.data.workDate))) {
    return context.json({ code: 'VALIDATION_ERROR', message: '分页或筛选条件不正确。' }, 400)
  }

  // studioId 一律取自认证上下文，不接受客户端传入
  const studioId = context.get('authContext').currentStudio.id
  const query: Required<Pick<EmployeeWorkListQueryDto, 'page' | 'pageSize'>> & Omit<EmployeeWorkListQueryDto, 'page' | 'pageSize'> = {
    page: result.data.page,
    pageSize: result.data.pageSize,
    employeeName: result.data.employeeName || undefined,
    workDate: result.data.workDate,
    sku: result.data.sku || undefined,
  }
  return context.json(await listEmployeeWorkItems(studioId, query))
})

employeeWorkRoutes.get('/employees', requireAuth, requirePermission('employee_work.read'), async (context) => {
  return context.json({ items: await listEmployeeNames(context.get('authContext').currentStudio.id) })
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

  const batch = await createEmployeeWorkImport({
    studioId: context.get('authContext').currentStudio.id,
    employeeName,
    workDate,
    fileName: file.name || '未命名文件.xlsx',
    uploadedBy: context.get('authUser').id,
    items,
  })

  return context.json({ batch, importedRows: items.length }, 201)
})
