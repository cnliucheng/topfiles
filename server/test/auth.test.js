import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest, buildTestServer, request, authedRequest, cleanupTest } from './helpers.js'
import { registerAuthRoutes } from '../src/auth/routes.js'

let ctx, server
beforeEach(() => {
  ctx = setupTest()
  const routes = {}
  registerAuthRoutes(routes, { db: ctx.db, secret: ctx.secret, rateLimit: null })
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

describe('POST /api/auth/setup', () => {
  it('creates the single account and signs in', async () => {
    const res = await request(server, 'POST', '/api/auth/setup',
      JSON.stringify({ username: 'alice', password: 'longenough' }),
      { 'content-type': 'application/json' }
    )
    expect(res.status).toBe(201)
    expect(res.json()).toEqual({ username: 'alice' })
    expect(res.headers.get('set-cookie')).toContain('tf_session=')
  })

  it('rejects short username', async () => {
    const res = await request(server, 'POST', '/api/auth/setup',
      JSON.stringify({ username: 'ab', password: 'longenough' }),
      { 'content-type': 'application/json' }
    )
    expect(res.status).toBe(400)
    expect(res.json().error.code).toBe('INVALID_USERNAME')
  })

  it('rejects weak password', async () => {
    const res = await request(server, 'POST', '/api/auth/setup',
      JSON.stringify({ username: 'alice', password: 'short' }),
      { 'content-type': 'application/json' }
    )
    expect(res.status).toBe(400)
    expect(res.json().error.code).toBe('WEAK_PASSWORD')
  })

  it('returns 409 when account already exists', async () => {
    ctx.db.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)').run('bob', 'h')
    const res = await request(server, 'POST', '/api/auth/setup',
      JSON.stringify({ username: 'alice', password: 'longenough' }),
      { 'content-type': 'application/json' }
    )
    expect(res.status).toBe(409)
    expect(res.json().error.code).toBe('ALREADY_INITIALIZED')
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    const { hashPassword } = await import('../src/auth/password.js')
    const hash = await hashPassword('longenough')
    ctx.db.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)').run('alice', hash)
  })

  it('logs in with correct password', async () => {
    const res = await request(server, 'POST', '/api/auth/login',
      JSON.stringify({ username: 'alice', password: 'longenough' }),
      { 'content-type': 'application/json' }
    )
    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ username: 'alice' })
    expect(res.headers.get('set-cookie') || res.headers.getSetCookie?.()?.[0]).toContain('tf_session=')
  })

  it('rejects wrong password', async () => {
    const res = await request(server, 'POST', '/api/auth/login',
      JSON.stringify({ username: 'alice', password: 'wrongwrong' }),
      { 'content-type': 'application/json' }
    )
    expect(res.status).toBe(401)
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS')
  })

  it('rejects unknown user with same message', async () => {
    const res = await request(server, 'POST', '/api/auth/login',
      JSON.stringify({ username: 'nobody', password: 'longenough' }),
      { 'content-type': 'application/json' }
    )
    expect(res.status).toBe(401)
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS')
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the cookie', async () => {
    const res = await request(server, 'POST', '/api/auth/logout')
    expect(res.status).toBe(204)
    const sc = res.headers.get('set-cookie') || res.headers.getSetCookie?.()?.[0]
    expect(sc).toContain('tf_session=')
    expect(sc).toContain('Max-Age=0')
  })
})

describe('GET /api/auth/me', () => {
  it('returns user when authed', async () => {
    ctx.db.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)').run('alice', 'h')
    const res = await authedRequest(server, 'GET', '/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ username: 'alice' })
  })

  it('returns 401 without auth', async () => {
    const res = await request(server, 'GET', '/api/auth/me')
    expect(res.status).toBe(401)
  })
})