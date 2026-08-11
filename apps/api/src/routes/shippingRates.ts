import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requirePermission, type AuthEnv } from '../modules/auth/auth.middleware.js'
import { parseShippingRateFile, ShippingRateFileError } from '../modules/ledger/shippingRateParser.js'
import {
  activateShippingRateVersion,
  createShippingRateVersion,
  getShippingRateVersionDetail,
  listShippingRateVersions,
} from '../modules/ledger/shippingRateRepository.js'

const versionNameSchema = z.string().trim().min(1).max(100)
const versionIdSchema = z.string().uuid()

export const shippingRateRoutes = new Hono<AuthEnv>()

// 物流资费为全局口径，仅管理员可维护；沿用仅管理员拥有的 user.manage 权限。
shippingRateRoutes.use('*', requireAuth, requirePermission('user.manage'))

shippingRateRoutes.get('/versions', async (context) => {
  return context.json({ items: await listShippingRateVersions() })
})

shippingRateRoutes.get('/versions/:versionId', async (context) => {
  const versionId = versionIdSchema.safeParse(context.req.param('versionId'))
  if (!versionId.success) {
    return context.json({ code: 'VALIDATION_ERROR', message: '资费版本 ID 不正确。' }, 400)
  }
  const detail = await getShippingRateVersionDetail(versionId.data)
  if (!detail) {
    return context.json({ code: 'NOT_FOUND', message: '资费版本不存在。' }, 404)
  }
  return context.json(detail)
})

shippingRateRoutes.post('/import', async (context) => {
  let formData: FormData
  try {
    formData = await context.req.formData()
  } catch {
    return context.json({ code: 'VALIDATION_ERROR', message: '上传请求格式不正确。' }, 400)
  }
  const file = formData.get('file')
  const versionName = versionNameSchema.safeParse(formData.get('versionName'))
  if (!(file instanceof File) || !versionName.success) {
    return context.json({ code: 'VALIDATION_ERROR', message: '请填写版本名称并选择物流资费 Excel。' }, 400)
  }
  if (!file.name || file.name.length > 255) {
    return context.json({ code: 'VALIDATION_ERROR', message: '资费表文件名长度必须在 1 到 255 个字符之间。' }, 400)
  }

  try {
    const rates = await parseShippingRateFile(file)
    const version = await createShippingRateVersion({
      name: versionName.data,
      sourceFileName: file.name,
      createdBy: context.get('authUser').id,
      rates,
    })
    return context.json({ version }, 201)
  } catch (error) {
    if (error instanceof ShippingRateFileError) {
      return context.json({ code: 'SHIPPING_RATE_FILE_INVALID', message: error.message }, 400)
    }
    throw error
  }
})

shippingRateRoutes.post('/versions/:versionId/activate', async (context) => {
  const versionId = versionIdSchema.safeParse(context.req.param('versionId'))
  if (!versionId.success) {
    return context.json({ code: 'VALIDATION_ERROR', message: '资费版本 ID 不正确。' }, 400)
  }
  const activated = await activateShippingRateVersion(versionId.data, context.get('authUser').id)
  if (!activated) {
    return context.json({ code: 'NOT_FOUND', message: '资费版本不存在。' }, 404)
  }
  return context.body(null, 204)
})
