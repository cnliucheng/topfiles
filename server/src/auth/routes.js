import { sendJson, sendError } from '../utils/json.js'
import { AppError } from '../errors.js'
import { hashPassword, verifyPassword } from './password.js'
import { signSession } from './jwt.js'
import { buildSessionCookie, clearSessionCookie, parseCookies } from './cookies.js'

const COOKIE_MAX_AGE = 7 * 24 * 3600

export function registerAuthRoutes(routes, { db, secret, cookieSecure = false, rateLimit }) {
  routes['GET /api/setup/status'] = (req, res) => {
    const n = db.prepare('SELECT COUNT(*) as n FROM users').get().n
    sendJson(res, 200, { hasAccount: n > 0 })
  }
}