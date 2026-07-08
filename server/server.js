import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { createDb } from './src/db.js'
import { registerAuthRoutes } from './src/auth/routes.js'
import { registerFileRoutes } from './src/files/routes.js'
import { registerShareRoutes } from './src/share/routes.js'
import { matchRoute } from './src/utils/router.js'
import { serveStatic } from './src/utils/static.js'
import { sendError, sendJson } from './src/utils/json.js'
import { RateLimiter } from './src/utils/rateLimit.js'

const PORT = +(process.env.PORT || 3000)
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-only-change-me-32-bytes-long')
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true'
const STATIC_DIR = resolve(process.env.STATIC_DIR || '../dist')
const DB_PATH = process.env.DB_PATH || './data.db'

const db = createDb(DB_PATH)
const rateLimit = new RateLimiter()

const routes = {}
registerAuthRoutes(routes, { db, secret: JWT_SECRET, cookieSecure: COOKIE_SECURE, rateLimit })
registerFileRoutes(routes, { db })
registerShareRoutes(routes, { db })

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
})