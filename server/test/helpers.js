import { createServer } from 'node:http'
import { createDb } from '../src/db.js'
import { signSession } from '../src/auth/jwt.js'
import { matchRoute } from '../src/utils/router.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '../src/errors.js'
import { sendError, sendJson } from '../src/utils/json.js'

const TEST_SECRET = new TextEncoder().encode('test-secret-32-bytes-long-12345')
let activeDb = null
let activeDir = null

export function setupTest() {
  cleanupTest()
  activeDir = mkdtempSync(join(tmpdir(), 'topfiles-test-'))
  const db = createDb(join(activeDir, 'data.sqlite'))
  activeDb = db
  const routes = {}
  return { db, routes, secret: TEST_SECRET }
}

export function buildTestServer({ routes }) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const m = matchRoute(req.method, url.pathname, routes)
    if (!m) { res.writeHead(404); return res.end() }
    req.params = m.params
    try {
      await m.handler(req, res)
    } catch (e) {
      sendError(res, e instanceof AppError ? e : new Error('boom'))
    }
  })
}

export async function authedRequest(server, method, path, body, username = 'alice') {
  const token = await signSession({ username }, TEST_SECRET)
  const headers = { cookie: `tf_session=${token}` }
  if (body) {
    headers['content-type'] = 'application/json'
    return request(server, method, path, JSON.stringify(body), headers)
  }
  return request(server, method, path, undefined, headers)
}

export function request(server, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const close = () => new Promise((done, fail) => {
      if (!server.listening) return done()
      server.close((error) => error ? fail(error) : done())
    })

    server.once('error', reject)
    server.listen(0, '127.0.0.1', async () => {
      try {
        const port = server.address().port
        const res = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: headers || {},
          body: body || undefined,
        })
        const text = await res.text()
        await close()
        resolve({ status: res.status, body: text, json: () => JSON.parse(text), headers: res.headers })
      } catch (e) {
        try { await close() } catch {}
        reject(e)
      }
    })
  })
}

export function cleanupTest() {
  activeDb?.close()
  activeDb = null
  if (activeDir) rmSync(activeDir, { recursive: true, force: true })
  activeDir = null
}
