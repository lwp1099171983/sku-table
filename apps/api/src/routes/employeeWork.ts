import { Hono } from 'hono'
import { z } from 'zod'
import type { EmployeeWorkListQueryDto } from '@sku-table/shared'
import { type AuthEnv, requireAuth, requireRole } from '../modules/auth/auth.middleware.js'
import { parseEmployeeWorkFileAsync } from '../modules/employee-work/parser.js'
import { createEmployeeWorkImport, listEmployeeNames, listEmployeeWorkItems } from '../modules/employee-work/repository.js'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '工作日期格式不正确。')

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
  employeeName: z.string().trim().max(100).optional(),
  workDate: dateSchema.optional(),
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

  const query: Required<Pick<EmployeeWorkListQueryDto, 'page' | 'pageSize'>> & Omit<EmployeeWorkListQueryDto, 'page' | 'pageSize'> = {
    ...result.data,
    employeeName: result.data.employeeName || undefined,
  }
  return context.json(await listEmployeeWorkItems(query))
})

employeeWorkRoutes.get('/employees', requireAuth, async (context) => {
  return context.json({ items: await listEmployeeNames() })
})

employeeWorkRoutes.post('/import', requireAuth, requireRole('owner'), async (context) => {
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

  const batch = await createEmployeeWorkImport({
    employeeName,
    workDate,
    fileName: file.name || '未命名文件.xlsx',
    uploadedBy: context.get('authUser').id,
    items,
  })

  return context.json({ batch, importedRows: items.length }, 201)
})
