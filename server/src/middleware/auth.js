import { verifySession } from '../auth/jwt.js'
import { parseCookies } from '../auth/cookies.js'
import { sendError } from '../utils/json.js'
import { AppError } from '../errors.js'

export function createAuthMiddleware({ secret }) {
  return async function authMiddleware(req, res, next) {
    const cookies = parseCookies(req.headers.cookie)
    const token = cookies.tf_session
    if (!token) {
      return sendError(res, new AppError(401, 'UNAUTHENTICATED', '请先登录'))
    }
    try {
      const payload = await verifySession(token, secret)
      req.user = { username: payload.username, sub: payload.sub }
      next()
    } catch {
      sendError(res, new AppError(401, 'UNAUTHENTICATED', '请先登录'))
    }
  }
}
