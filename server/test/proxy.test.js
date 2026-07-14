import { describe, it, expect, afterEach } from 'vitest'
import { setupTest, buildTestServer, request, cleanupTest } from './helpers.js'
import { registerAuthRoutes } from '../src/auth/routes.js'
import { RateLimiter } from '../src/utils/rateLimit.js'

let server
// 已有账号，使 setup 走 409 分支（不触发 bcrypt），便于快速打满限流配额
function build(trustProxy) {
  const ctx = setupTest()
  ctx.db.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)').run('alice', 'h')
  const rateLimit = new RateLimiter()
  const routes = {}
  registerAuthRoutes(routes, { db: ctx.db, secret: ctx.secret, rateLimit, trustProxy })
  server = buildTestServer({ routes })
}

const setupBody = JSON.stringify({ username: 'bob', password: 'longenough' })
const jsonHead = { 'content-type': 'application/json' }

describe('trustProxy & x-forwarded-for', () => {
  afterEach(() => cleanupTest())

  it('ignores x-forwarded-for when trustProxy is off (spoofed IP cannot bypass rate limit)', async () => {
    build(false)
    for (let i = 0; i < 5; i++) {
      const res = await request(server, 'POST', '/api/auth/setup', setupBody,
        { ...jsonHead, 'x-forwarded-for': `1.2.3.${i}` })
      expect(res.status).toBe(409)
    }
    const res = await request(server, 'POST', '/api/auth/setup', setupBody,
      { ...jsonHead, 'x-forwarded-for': '9.9.9.9' })
    expect(res.status).toBe(429)
  })

  it('uses x-forwarded-for as the bucket key when trustProxy is on', async () => {
    build(true)
    // 每个不同 xff 都是独立 bucket，6 个不同 IP 各打一次都不会被限流
    for (let i = 0; i < 6; i++) {
      const res = await request(server, 'POST', '/api/auth/setup', setupBody,
        { ...jsonHead, 'x-forwarded-for': `1.2.3.${i}` })
      expect(res.status).toBe(409)
    }
  })
})
