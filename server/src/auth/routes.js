import { sendJson, sendError } from '../utils/json.js'
import { AppError } from '../errors.js'
import { hashPassword, verifyPassword } from './password.js'
import { signSession } from './jwt.js'
import { buildSessionCookie, clearSessionCookie, parseCookies } from './cookies.js'

const COOKIE_MAX_AGE = 7 * 24 * 3600
const MAX_JSON = 1024 * 1024 + 1024

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', c => {
      buf += c
      if (buf.length > MAX_JSON) { req.destroy(); reject(new Error('too large')) }
    })
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}) } catch { reject(new Error('invalid json')) }
    })
    req.on('error', reject)
  })
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress
}

export function registerAuthRoutes(routes, { db, secret, cookieSecure = false, rateLimit }) {
  routes['GET /api/setup/status'] = (req, res) => {
    const n = db.prepare('SELECT COUNT(*) as n FROM users').get().n
    sendJson(res, 200, { hasAccount: n > 0 })
  }

  routes['POST /api/auth/setup'] = async (req, res) => {
    const body = await readJsonBody(req)
    const { username, password } = body
    if (!username || !password) throw new AppError(400, 'INVALID_REQUEST', '用户名和密码必填')
    if (!/^[a-z0-9_-]{3,32}$/i.test(username)) throw new AppError(400, 'INVALID_USERNAME', '用户名 3-32 位，字母数字 _ -')
    if (password.length < 8) throw new AppError(400, 'WEAK_PASSWORD', '密码至少 8 位')
    if (rateLimit && !rateLimit.allow(`setup:${getClientIp(req)}`, 5, 60000)) {
      throw new AppError(429, 'RATE_LIMITED', '请求过于频繁')
    }
    const n = db.prepare('SELECT COUNT(*) as n FROM users').get().n
    if (n > 0) throw new AppError(409, 'ALREADY_INITIALIZED', '已存在账号')
    const hash = await hashPassword(password)
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)').run(username, hash)
    const jwt = await signSession({ username }, secret)
    res.setHeader('Set-Cookie', buildSessionCookie(jwt, { secure: cookieSecure, maxAge: COOKIE_MAX_AGE }))
    sendJson(res, 201, { username })
  }

  routes['POST /api/auth/login'] = async (req, res) => {
    const body = await readJsonBody(req)
    const { username, password } = body
    if (!username || !password) throw new AppError(400, 'INVALID_REQUEST', '用户名和密码必填')
    if (rateLimit && !rateLimit.allow(`login:${getClientIp(req)}`, 5, 60000)) {
      throw new AppError(429, 'RATE_LIMITED', '请求过于频繁')
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
    if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误')
    const ok = await verifyPassword(password, user.password_hash)
    if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码错误')
    const jwt = await signSession({ username: user.username }, secret)
    res.setHeader('Set-Cookie', buildSessionCookie(jwt, { secure: cookieSecure, maxAge: COOKIE_MAX_AGE }))
    sendJson(res, 200, { username: user.username })
  }

  routes['POST /api/auth/logout'] = (req, res) => {
    res.setHeader('Set-Cookie', clearSessionCookie())
    res.writeHead(204); res.end()
  }

  routes['GET /api/auth/me'] = (req, res) => {
    const cookies = parseCookies(req.headers.cookie)
    if (!cookies.tf_session) throw new AppError(401, 'UNAUTHENTICATED', '请先登录')
    const user = db.prepare('SELECT username FROM users LIMIT 1').get()
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', '请先登录')
    sendJson(res, 200, { username: user.username })
  }
}
