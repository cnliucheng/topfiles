import { describe, it, expect, beforeEach } from 'vitest'
import { createAuthMiddleware } from '../src/middleware/auth.js'

function mockReq(cookies = {}) {
  return { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } }
}
function mockRes() {
  const r = { statusCode: 200, body: null, headers: {} }
  r.writeHead = (s, h = {}) => { r.statusCode = s; r.headers = h; return r }
  r.end = (b) => { r.body = b; return r }
  return r
}

describe('authMiddleware', () => {
  const SECRET = new TextEncoder().encode('secret-secret-secret-secret-32b')
  let mw, signSession

  beforeEach(async () => {
    mw = createAuthMiddleware({ secret: SECRET })
    const jose = await import('jose')
    signSession = (username) => new jose.SignJWT({ sub: 'user:1', username })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(SECRET)
  })

  it('sets req.user when cookie is valid', async () => {
    const token = await signSession('alice')
    const req = mockReq({ tf_session: token })
    const res = mockRes()
    const next = { called: false, fn: () => { next.called = true } }
    await mw(req, res, next.fn)
    expect(next.called).toBe(true)
    expect(req.user.username).toBe('alice')
  })

  it('returns 401 without cookie', async () => {
    const req = mockReq()
    const res = mockRes()
    const next = { called: false, fn: () => { next.called = true } }
    await mw(req, res, next.fn)
    expect(next.called).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 with bad cookie', async () => {
    const req = mockReq({ tf_session: 'not-a-jwt' })
    const res = mockRes()
    const next = { called: false, fn: () => { next.called = true } }
    await mw(req, res, next.fn)
    expect(next.called).toBe(false)
    expect(res.statusCode).toBe(401)
  })
})
