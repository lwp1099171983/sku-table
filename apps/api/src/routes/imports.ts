import { Hono } from 'hono'
import { type AuthEnv, requireAuth, requirePermission } from '../modules/auth/auth.middleware.js'
import { parseEmployeeWorkFileAsync } from '../modules/employee-work/parser.js'
import { createProductImport } from '../modules/products/product.repository.js'

export const importRoutes = new Hono<AuthEnv>()

importRoutes.post('/', requireAuth, requirePermission('product.import'), async (context) => {
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
    items = await parseEmployeeWorkFileAsync(file)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Excel 文件无法解析。'
    return context.json({ code: 'IMPORT_FILE_INVALID', message }, 400)
  }

  const batch = await createProductImport({
    studioId: context.get('authContext').currentStudio.id,
    fileName: file.name || '未命名文件.xlsx',
    createdBy: context.get('authUser').id,
    items,
  })

  return context.json({ batch }, 201)
})
