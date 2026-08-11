import type { Context } from 'hono'
import { z } from 'zod'
import type { PermissionCode } from '@sku-table/shared'
import { forbidden, type AuthEnv } from '../modules/auth/auth.middleware.js'
import { loadAuthContextForShop } from '../modules/auth/auth.service.js'

// 读取并校验 JSON 请求体；请求体非法或校验失败返回 null
export async function readBody<T>(context: Context<AuthEnv>, schema: z.ZodType<T>) {
  try {
    const body = await context.req.json()
    const result = schema.safeParse(body)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

// 解析店铺查询范围：全部视图仅返回当前账号具备目标权限的可访问店铺
export async function resolveShopScope(
  context: Context<AuthEnv>,
  shopId?: string,
  permission?: PermissionCode,
): Promise<{ shopIds: string[] | null } | Response> {
  const authContext = context.get('authContext')
  const accessibleIds = authContext.shops.map((shop) => shop.id)
  if (shopId) {
    if (!accessibleIds.includes(shopId)) {
      return forbidden(context, '无权访问该店铺数据。')
    }
    if (permission) {
      const shopContext = await loadAuthContextForShop(context.get('authUser').id, shopId)
      if (!shopContext?.permissions.includes(permission)) {
        return forbidden(context)
      }
    }
    return { shopIds: [shopId] }
  }
  if (authContext.roles.includes('admin')) {
    return { shopIds: null }
  }
  if (!permission) {
    return { shopIds: accessibleIds }
  }

  const shopContexts = await Promise.all(accessibleIds.map((accessibleShopId) => (
    loadAuthContextForShop(context.get('authUser').id, accessibleShopId)
  )))
  const permittedShopIds = accessibleIds.filter((_, index) => (
    shopContexts[index]?.permissions.includes(permission)
  ))
  if (permittedShopIds.length === 0) {
    return forbidden(context)
  }
  return { shopIds: permittedShopIds }
}

// 解析删除范围并校验删除权限：带 shopId 时按该店铺校验；不带时仅允许删除自己有删除权限的店铺
export async function resolveDeleteScope(
  context: Context<AuthEnv>,
  permission: PermissionCode,
  shopId?: string,
): Promise<{ shopIds: string[] | null } | Response> {
  const authUser = context.get('authUser')
  const authContext = context.get('authContext')
  if (shopId) {
    const shopContext = await loadAuthContextForShop(authUser.id, shopId)
    if (!shopContext || !shopContext.permissions.includes(permission)) {
      return forbidden(context)
    }
    return { shopIds: [shopId] }
  }
  if (authContext.roles.includes('admin')) {
    return { shopIds: null }
  }
  // 非管理员：逐店铺校验删除权限，避免默认店铺的权限被放大到全部可访问店铺
  const permittedShopIds: string[] = []
  for (const shop of authContext.shops) {
    const shopContext = await loadAuthContextForShop(authUser.id, shop.id)
    if (shopContext?.permissions.includes(permission)) {
      permittedShopIds.push(shop.id)
    }
  }
  if (permittedShopIds.length === 0) {
    return forbidden(context)
  }
  return { shopIds: permittedShopIds }
}
