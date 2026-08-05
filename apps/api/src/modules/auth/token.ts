import { jwtVerify, SignJWT } from 'jose'
import { env } from '../../config/env.js'

const issuer = 'sku-table-api'
const secret = new TextEncoder().encode(env.JWT_SECRET)

// JWT 只保存用户 ID，不保存角色和权限，避免权限变更后令牌内容过期
export async function createAccessToken(user: { id: string }) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_EXPIRES_IN_SECONDS}s`)
    .sign(secret)
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
    issuer,
  })
  return payload.sub ?? null
}
