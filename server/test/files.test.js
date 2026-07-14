import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest, buildTestServer, request, authedRequest, cleanupTest } from './helpers.js'
import { registerAuthRoutes } from '../src/auth/routes.js'
import { registerFileRoutes } from '../src/files/routes.js'
import { signSession } from '../src/auth/jwt.js'

let ctx, server, authHeader
beforeEach(async () => {
  ctx = setupTest()
  const routes = {}
  registerAuthRoutes(routes, { db: ctx.db, secret: ctx.secret, rateLimit: null })
  registerFileRoutes(routes, { db: ctx.db, secret: ctx.secret })
  server = buildTestServer({ routes })
  const token = await signSession({ username: 'alice' }, ctx.secret)
  authHeader = { cookie: `tf_session=${token}` }
})
afterEach(() => cleanupTest())

function postJson(path, body) {
  return request(server, 'POST', path, JSON.stringify(body), { ...authHeader, 'content-type': 'application/json' })
}

describe('GET /api/files', () => {
  it('returns empty list initially', async () => {
    const res = await authedRequest(server, 'GET', '/api/files')
    expect(res.status).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('lists files ordered by updated_at desc', async () => {
    ctx.db.prepare('INSERT INTO files (filename, content, size_bytes, updated_at) VALUES (?, ?, ?, ?)').run('a.md', 'A', 1, '2024-01-01 00:00:00')
    ctx.db.prepare('INSERT INTO files (filename, content, size_bytes, updated_at) VALUES (?, ?, ?, ?)').run('b.md', 'B', 1, '2024-02-01 00:00:00')
    const res = await authedRequest(server, 'GET', '/api/files')
    const list = res.json()
    expect(list[0].filename).toBe('b.md')
    expect(list[1].filename).toBe('a.md')
  })

  it('returns 401 without auth', async () => {
    const res = await request(server, 'GET', '/api/files')
    expect(res.status).toBe(401)
  })

  it('returns 401 with a forged (non-JWT) cookie', async () => {
    const res = await request(server, 'GET', '/api/files', undefined, { cookie: 'tf_session=forged' })
    expect(res.status).toBe(401)
  })

  it('returns 401 with a token signed by the wrong secret', async () => {
    const wrong = new TextEncoder().encode('wrong-wrong-wrong-wrong-wrong-32b')
    const token = await signSession({ username: 'alice' }, wrong)
    const res = await request(server, 'GET', '/api/files', undefined, { cookie: `tf_session=${token}` })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/files', () => {
  it('creates a file', async () => {
    const res = await postJson('/api/files', { filename: 'a.md', content: '# hello' })
    expect(res.status).toBe(201)
    expect(res.json().filename).toBe('a.md')
    expect(res.json().sizeBytes).toBe(7)
  })

  it('rejects duplicate filename (case-insensitive)', async () => {
    await postJson('/api/files', { filename: 'A.MD', content: 'x' })
    const res = await postJson('/api/files', { filename: 'a.md', content: 'y' })
    expect(res.status).toBe(409)
    expect(res.json().error.code).toBe('FILENAME_CONFLICT')
  })

  it('rejects content > 1MB', async () => {
    const big = 'x'.repeat(1024 * 1024 + 1)
    const res = await postJson('/api/files', { filename: 'big.txt', content: big })
    expect(res.status).toBe(413)
    expect(res.json().error.code).toBe('CONTENT_TOO_LARGE')
  })

  it('rejects missing filename', async () => {
    const res = await postJson('/api/files', { content: 'x' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/files/:id', () => {
  it('returns file with content', async () => {
    ctx.db.prepare('INSERT INTO files (filename, content, size_bytes) VALUES (?, ?, ?)').run('a.md', 'hello', 5)
    const res = await authedRequest(server, 'GET', '/api/files/1')
    expect(res.status).toBe(200)
    expect(res.json().content).toBe('hello')
  })

  it('returns 404 for missing', async () => {
    const res = await authedRequest(server, 'GET', '/api/files/999')
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/files/:id', () => {
  it('updates content', async () => {
    ctx.db.prepare('INSERT INTO files (filename, content, size_bytes) VALUES (?, ?, ?)').run('a.md', 'old', 3)
    const res = await request(server, 'PUT', '/api/files/1', JSON.stringify({ content: 'new' }),
      { ...authHeader, 'content-type': 'application/json' })
    expect(res.status).toBe(200)
    const fetched = await authedRequest(server, 'GET', '/api/files/1')
    expect(fetched.json().content).toBe('new')
  })

  it('returns 404 for missing', async () => {
    const res = await request(server, 'PUT', '/api/files/999', JSON.stringify({ content: 'x' }),
      { ...authHeader, 'content-type': 'application/json' })
    expect(res.status).toBe(404)
  })

  it('rejects content > 1MB', async () => {
    ctx.db.prepare('INSERT INTO files (filename, content, size_bytes) VALUES (?, ?, ?)').run('a.md', 'x', 1)
    const big = 'x'.repeat(1024 * 1024 + 1)
    const res = await request(server, 'PUT', '/api/files/1', JSON.stringify({ content: big }),
      { ...authHeader, 'content-type': 'application/json' })
    expect(res.status).toBe(413)
  })
})

describe('DELETE /api/files/:id', () => {
  it('deletes file', async () => {
    ctx.db.prepare('INSERT INTO files (filename, content, size_bytes) VALUES (?, ?, ?)').run('a.md', 'x', 1)
    const res = await authedRequest(server, 'DELETE', '/api/files/1')
    expect(res.status).toBe(204)
    const list = await authedRequest(server, 'GET', '/api/files')
    expect(list.json()).toEqual([])
  })
})
