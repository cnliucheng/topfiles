import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { createDb } from './src/db.js'
import { registerAuthRoutes } from './src/auth/routes.js'
import { registerFileRoutes } from './src/files/routes.js'
import { registerFolderRoutes } from './src/folders/routes.js'
import { registerShareRoutes } from './src/share/routes.js'
import { matchRoute } from './src/utils/router.js'
import { serveStatic } from './src/utils/static.js'
import { sendError, sendJson } from './src/utils/json.js'
import { RateLimiter } from './src/utils/rateLimit.js'

const PORT = +(process.env.PORT || 3000)
const IS_PROD = process.env.NODE_ENV === 'production'

// JWT 密钥：生产环境必须显式设置，否则任何人都能伪造合法会话。
const JWT_SECRET_RAW = process.env.JWT_SECRET
if (!JWT_SECRET_RAW) {
  if (IS_PROD) {
    console.error('[topfiles] FATAL: JWT_SECRET must be set in production')
    process.exit(1)
  }
  console.warn('[topfiles] WARNING: using default JWT_SECRET (dev only); set JWT_SECRET in production')
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW || 'dev-only-change-me-32-bytes-long')

const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true'
if (IS_PROD && !COOKIE_SECURE) {
  console.error('[topfiles] FATAL: COOKIE_SECURE=true must be set in production')
  process.exit(1)
}

// 仅在反向代理（Nginx 等）后面才应开启，否则客户端可伪造 x-forwarded-for 绕过限流。
const TRUST_PROXY = process.env.TRUST_PROXY === 'true'

const STATIC_DIR = resolve(process.env.STATIC_DIR || '../dist')
const DB_PATH = process.env.DB_PATH || './data.db'

const db = createDb(DB_PATH)
const rateLimit = new RateLimiter()

const routes = {}
registerAuthRoutes(routes, { db, secret: JWT_SECRET, cookieSecure: COOKIE_SECURE, rateLimit, trustProxy: TRUST_PROXY })
registerFileRoutes(routes, { db, secret: JWT_SECRET })
registerFolderRoutes(routes, { db, secret: JWT_SECRET })
registerShareRoutes(routes, { db, rateLimit, trustProxy: TRUST_PROXY })

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const m = matchRoute(req.method, url.pathname, routes)
  if (m) {
    req.params = m.params
    try {
      await m.handler(req, res)
    } catch (err) {
      console.error('[error]', req.method, url.pathname, err)
      sendError(res, err)
    }
    return
  }
  // 静态文件（仅 GET）
  if (req.method === 'GET') {
    return serveStatic(req, res, url.pathname, STATIC_DIR)
  }
  sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } })
})

server.listen(PORT, () => {
  console.log(`[topfiles] listening on http://127.0.0.1:${PORT}`)
  console.log(`[topfiles] static dir: ${STATIC_DIR}`)
  console.log(`[topfiles] db: ${DB_PATH}`)
  console.log(`[topfiles] trust proxy: ${TRUST_PROXY}`)
})

function shutdown(signal) {
  console.log(`[topfiles] received ${signal}, shutting down gracefully...`)
  server.close((err) => {
    if (err) {
      console.error('[topfiles] error during shutdown:', err)
      process.exit(1)
    }
    console.log('[topfiles] server closed, all connections drained')
    process.exit(0)
  })
  setTimeout(() => {
    console.warn('[topfiles] forced shutdown after 10s timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
