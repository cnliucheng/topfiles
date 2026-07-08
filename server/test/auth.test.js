import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest, buildTestServer, request, authedRequest, cleanupTest } from './helpers.js'
import { registerAuthRoutes } from '../src/auth/routes.js'

let ctx, server
beforeEach(() => {
  ctx = setupTest()
  const routes = {}
  registerAuthRoutes(routes, { db: ctx.db, secret: ctx.secret })
  server = buildTestServer({ routes })
})
afterEach(() => cleanupTest())

describe('GET /api/setup/status', () => {
  it('returns hasAccount=false when no user', async () => {
    const res = await request(server, 'GET', '/api/setup/status')
    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ hasAccount: false })
  })

  it('returns hasAccount=true when user exists', async () => {
    ctx.db.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)').run('alice', 'h')
    const res = await request(server, 'GET', '/api/setup/status')
    expect(res.json()).toEqual({ hasAccount: true })
  })
})