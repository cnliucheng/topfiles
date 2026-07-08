import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTest, buildTestServer, request, authedRequest, cleanupTest } from './helpers.js'
import { registerAuthRoutes } from '../src/auth/routes.js'
import { registerFileRoutes } from '../src/files/routes.js'
import { registerShareRoutes } from '../src/share/routes.js'
import { signSession } from '../src/auth/jwt.js'

let ctx, server
beforeAll(() => {
  ctx = setupTest()
  const routes = {}
  registerAuthRoutes(routes, { db: ctx.db, secret: ctx.secret })
  registerFileRoutes(routes, { db: ctx.db })
  registerShareRoutes(routes, { db: ctx.db })
  server = buildTestServer({ routes })
})
afterAll(() => cleanupTest())

describe('end-to-end flow', () => {
  it('setup → create → list → public link', async () => {
    let res = await request(server, 'POST', '/api/auth/setup',
      JSON.stringify({ username: 'alice', password: 'longenough' }),
      { 'content-type': 'application/json' })
    expect(res.status).toBe(201)

    const token = await signSession({ username: 'alice' }, ctx.secret)
    const auth = { cookie: `tf_session=${token}` }
    const json = { ...auth, 'content-type': 'application/json' }

    res = await request(server, 'GET', '/api/setup/status')
    expect(res.json().hasAccount).toBe(true)

    res = await request(server, 'GET', '/api/auth/me', undefined, auth)
    expect(res.json()).toEqual({ username: 'alice' })

    res = await request(server, 'POST', '/api/files',
      JSON.stringify({ filename: 'hello.md', content: '# Hi' }), json)
    expect(res.status).toBe(201)
    const fileId = res.json().id

    res = await request(server, 'GET', '/api/files', undefined, auth)
    expect(res.json()).toHaveLength(1)

    res = await request(server, 'PUT', `/api/files/${fileId}`,
      JSON.stringify({ content: '# Updated' }), json)
    expect(res.status).toBe(200)

    res = await request(server, 'GET', `/api/files/${fileId}`, undefined, auth)
    expect(res.json().content).toBe('# Updated')

    res = await request(server, 'GET', '/u/hello.md')
    expect(res.status).toBe(200)
    expect(res.body).toBe('# Updated')

    res = await request(server, 'DELETE', `/api/files/${fileId}`, undefined, auth)
    expect(res.status).toBe(204)

    res = await request(server, 'GET', '/u/hello.md')
    expect(res.status).toBe(404)
  })
})