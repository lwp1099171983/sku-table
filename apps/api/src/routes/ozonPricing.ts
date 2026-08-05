import { Hono } from 'hono'
import { z } from 'zod'
import type { OzonPricingListQueryDto } from '@sku-table/shared'
import { type AuthEnv, requireAuth, requireRole } from '../modules/auth/auth.middleware.js'
import { parseOzonPricingFileAsync } from '../modules/ozon-pricing/parser.js'
import { createOzonPricingImport, listOzonPricing } from '../modules/ozon-pricing/repository.js'

const querySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(100), store: z.string().trim().max(100).optional(), keyword: z.string().trim().max(200).optional() })

export const ozonPricingRoutes = new Hono<AuthEnv>()
ozonPricingRoutes.get('/', requireAuth, async (context) => {
  const result = querySchema.safeParse(context.req.query())
  if (!result.success) return context.json({ code: 'VALIDATION_ERROR', message: '分页或筛选条件不正确。' }, 400)
  const query: Required<Pick<OzonPricingListQueryDto, 'page' | 'pageSize'>> & Omit<OzonPricingListQueryDto, 'page' | 'pageSize'> = { ...result.data, store: result.data.store || undefined, keyword: result.data.keyword || undefined }
  return context.json(await listOzonPricing(query))
})

ozonPricingRoutes.post('/import', requireAuth, requireRole('owner'), async (context) => {
  let formData: FormData
  try { formData = await context.req.formData() } catch { return context.json({ code: 'VALIDATION_ERROR', message: '上传请求格式不正确。' }, 400) }
  const file = formData.get('file')
  if (!(file instanceof File)) return context.json({ code: 'VALIDATION_ERROR', message: '请选择 Excel 文件。' }, 400)
  let items
  try { items = await parseOzonPricingFileAsync(file) } catch (error) { return context.json({ code: 'IMPORT_FILE_INVALID', message: error instanceof Error ? error.message : 'Excel 文件无法解析。' }, 400) }
  const batch = await createOzonPricingImport({ fileName: file.name || '未命名文件.xlsx', uploadedBy: context.get('authUser').id, items })
  return context.json({ batch, importedRows: items.length }, 201)
})
