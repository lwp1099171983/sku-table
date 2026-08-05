import { jwtVerify, SignJWT } from 'jose'
import { env } from '../../config/env.js'

const issuer = 'sku-table-api'
const secret = new TextEncoder().encode(env.JWT_SECRET)

export async function createAccessToken(user: { id: string; email: string; role: string }) {
  return new SignJWT({ email: user.email, role: user.role })
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
