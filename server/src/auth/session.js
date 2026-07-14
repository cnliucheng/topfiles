import { verifySession } from './jwt.js'
import { parseCookies } from './cookies.js'
import { AppError } from '../errors.js'

// 校验请求携带的会话 cookie，成功时把用户信息挂到 req.user。
// 与公开分享接口（GET /u/:filename）不同，所有 /api/* 管理接口都必经此函数。
export async function authenticate(req, secret) {
  const cookies = parseCookies(req.headers.cookie)
  const token = cookies.tf_session
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', '请先登录')
  try {
    const payload = await verifySession(token, secret)
    req.user = { username: payload.username, sub: payload.sub }
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', '请先登录')
  }
}
