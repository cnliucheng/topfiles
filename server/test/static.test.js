import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { serveStatic } from '../src/utils/static.js'

let dir, server
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'topfiles-static-'))
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    await serveStatic(req, res, url.pathname, dir)
  })
})
afterEach(() => { server.close(); rmSync(dir, { recursive: true, force: true }) })

function get(path) {
  return new Promise((resolve) => {
    server.listen(0, async () => {
      const port = server.address().port
      const res = await fetch(`http://127.0.0.1:${port}${path}`)
      const text = await res.text()
      server.close()
      resolve({ status: res.status, body: text, contentType: res.headers.get('content-type') })
    })
  })
}

describe('serveStatic', () => {
  it('serves a file', async () => {
    writeFileSync(join(dir, 'a.txt'), 'hello')
    const res = await get('/a.txt')
    expect(res.status).toBe(200)
    expect(res.body).toBe('hello')
    expect(res.contentType).toContain('text/plain')
  })

  it('falls back to index.html for /', async () => {
    writeFileSync(join(dir, 'index.html'), '<html>app</html>')
    const res = await get('/')
    expect(res.status).toBe(200)
    expect(res.body).toBe('<html>app</html>')
  })

  it('falls back to index.html for SPA routes', async () => {
    writeFileSync(join(dir, 'index.html'), '<html>app</html>')
    const res = await get('/u/some-file')
    expect(res.status).toBe(200)
    expect(res.body).toBe('<html>app</html>')
  })

  it('returns 404 for missing', async () => {
    const res = await get('/missing.html')
    expect(res.status).toBe(404)
  })
})