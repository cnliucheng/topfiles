import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest, buildTestServer, request, cleanupTest } from './helpers.js'
import { registerAuthRoutes } from '../src/auth/routes.js'
import { RateLimiter } from '../src/utils/rateLimit.js'
import { hashPassword } from '../src/auth/password.js'
import { signSession } from '../src/auth/jwt.js'

let ctx, server, auth, rateLimit
beforeEach(async () => {
  ctx = setupTest()
  rateLimit = new RateLimiter()
  const routes = {}
  registerAuthRoutes(routes, { db: ctx.db, secret: ctx.secret, rateLimit })
  server = buildTestServer({ routes })
  const hash = await hashPassword('longenough')
  ctx.db.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)').run('alice', hash)
  const token = await signSession({ username: 'alice' }, ctx.secret)
  auth = { cookie: `tf_session=${token}`, 'content-type': 'application/json' }
})
afterEach(() => cleanupTest())

function putAccount(body) {
  return request(server, 'PUT', '/api/auth/account', JSON.stringify(body), auth)
}

describe('PUT /api/auth/account', () => {
  it('changes the password', async () => {
    let res = await putAccount({ currentPassword: 'longenough', newPassword: 'newpassword' })
    expect(res.status).toBe(200)
    res = await request(server, 'POST', '/api/auth/login',
      JSON.stringify({ username: 'alice', password: 'newpassword' }), { 'content-type': 'application/json' })
    expect(res.status).toBe(200)
  })

  it('rejects wrong current password', async () => {
    const res = await putAccount({ currentPassword: 'wrong', newPassword: 'newpassword' })
    expect(res.status).toBe(401)
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS')
  })

  it('changes the username and re-signs the session', async () => {
    const res = await putAccount({ currentPassword: 'longenough', newUsername: 'bob' })
    expect(res.status).toBe(200)
    expect(res.json().username).toBe('bob')
    expect(res.headers.get('set-cookie')).toContain('tf_session=')
  })

  it('rate-limits repeated wrong current passwords', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await putAccount({ currentPassword: 'wrong', newPassword: 'newpassword' })
      expect(res.status).toBe(401)
    }
    const res = await putAccount({ currentPassword: 'wrong', newPassword: 'newpassword' })
    expect(res.status).toBe(429)
    expect(res.json().error.code).toBe('RATE_LIMITED')
  })
})
