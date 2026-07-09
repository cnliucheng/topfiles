import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest, buildTestServer, request, cleanupTest } from './helpers.js'
import { registerShareRoutes } from '../src/share/routes.js'

let ctx, server
beforeEach(() => {
  ctx = setupTest()
  const routes = {}
  registerShareRoutes(routes, { db: ctx.db })
  server = buildTestServer({ routes })
})
afterEach(() => cleanupTest())

describe('GET /u/:filename', () => {
  it('serves file content', async () => {
    ctx.db.prepare('INSERT INTO files (filename, content, mime_type, size_bytes) VALUES (?, ?, ?, ?)')
      .run('hello.md', '# Hello', 'text/markdown; charset=utf-8', 7)
    const res = await request(server, 'GET', '/u/hello.md')
    expect(res.status).toBe(200)
    expect(res.body).toBe('# Hello')
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
  })

  it('returns 404 for missing file', async () => {
    const res = await request(server, 'GET', '/u/nonexistent.md')
    expect(res.status).toBe(404)
  })

  it('does not require auth', async () => {
    ctx.db.prepare('INSERT INTO files (filename, content, size_bytes) VALUES (?, ?, ?)').run('a.md', 'x', 1)
    const res = await request(server, 'GET', '/u/a.md')
    expect(res.status).toBe(200)
  })

  it('sets cache header', async () => {
    ctx.db.prepare('INSERT INTO files (filename, content, size_bytes) VALUES (?, ?, ?)').run('a.md', 'x', 1)
    const res = await request(server, 'GET', '/u/a.md')
    expect(res.headers.get('cache-control')).toContain('public')
  })
})