import { sendJson, sendError } from '../utils/json.js'
import { AppError } from '../errors.js'
import { hashPassword, verifyPassword } from './password.js'
import { signSession } from './jwt.js'
import { authenticate } from './session.js'
import { buildSessionCookie, clearSessionCookie } from './cookies.js'
import { readJsonBody } from '../utils/jsonBody.js'

const COOKIE_MAX_AGE = 7 * 24 * 3600

export function registerAuthRoutes(routes, { db, secret, cookieSecure = false, rateLimit, trustProxy = false }) {
  // 仅在反向代理后（trustProxy=true）才信任 x-forwarded-for，否则用真实连接地址，
  // 避免客户端伪造该头把请求分散到不同 bucket 以绕过登录/注册/改账号的限流。
  function getClientIp(req) {
    if (trustProxy) {
      const xff = req.headers['x-forwarded-for']
      if (xff) return xff.split(',')[0].trim()
    }
    return req.socket.remoteAddress
  }

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

  routes['PUT /api/auth/account'] = async (req, res) => {
    const body = await readJsonBody(req)
    const { currentPassword, newUsername, newPassword } = body
    if (!currentPassword) throw new AppError(400, 'INVALID_REQUEST', '当前密码必填')
    if (rateLimit && !rateLimit.allow(`account:${getClientIp(req)}`, 5, 60000)) {
      throw new AppError(429, 'RATE_LIMITED', '请求过于频繁')
    }

    const user = db.prepare('SELECT * FROM users WHERE id = 1').get()
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', '请先登录')
    const ok = await verifyPassword(currentPassword, user.password_hash)
    if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', '当前密码错误')

    let username = user.username

    // 修改密码
    if (newPassword) {
      if (newPassword.length < 8) throw new AppError(400, 'WEAK_PASSWORD', '密码至少 8 位')
      const hash = await hashPassword(newPassword)
      db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(hash)
    }

    // 修改用户名
    if (newUsername) {
      if (!/^[a-z0-9_-]{3,32}$/i.test(newUsername)) throw new AppError(400, 'INVALID_USERNAME', '用户名 3-32 位，字母数字 _ -')
      db.prepare('UPDATE users SET username = ? WHERE id = 1').run(newUsername)
      username = newUsername
    }

    // 重签 JWT（用户名可能变了）
    const jwt = await signSession({ username }, secret)
    res.setHeader('Set-Cookie', buildSessionCookie(jwt, { secure: cookieSecure, maxAge: COOKIE_MAX_AGE }))
    sendJson(res, 200, { username })
  }

  routes['GET /api/auth/me'] = async (req, res) => {
    await authenticate(req, secret)
    const user = db.prepare('SELECT username FROM users LIMIT 1').get()
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', '请先登录')
    sendJson(res, 200, { username: user.username })
  }
}
