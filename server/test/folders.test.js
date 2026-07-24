import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest, buildTestServer, request, authedRequest, cleanupTest } from './helpers.js'
import { registerAuthRoutes } from '../src/auth/routes.js'
import { registerFileRoutes } from '../src/files/routes.js'
import { registerFolderRoutes } from '../src/folders/routes.js'
import { signSession } from '../src/auth/jwt.js'

let ctx, server, authHeader
beforeEach(async () => {
  ctx = setupTest()
  const routes = {}
  registerAuthRoutes(routes, { db: ctx.db, secret: ctx.secret, rateLimit: null })
  registerFileRoutes(routes, { db: ctx.db, secret: ctx.secret })
  registerFolderRoutes(routes, { db: ctx.db, secret: ctx.secret })
  server = buildTestServer({ routes })
  const token = await signSession({ username: 'alice' }, ctx.secret)
  authHeader = { cookie: `tf_session=${token}` }
})
afterEach(() => cleanupTest())

function postJson(path, body) {
  return request(server, 'POST', path, JSON.stringify(body), { ...authHeader, 'content-type': 'application/json' })
}
function putJson(path, body) {
  return request(server, 'PUT', path, JSON.stringify(body), { ...authHeader, 'content-type': 'application/json' })
}

describe('GET /api/folders', () => {
  it('returns empty list initially', async () => {
    const res = await authedRequest(server, 'GET', '/api/folders')
    expect(res.status).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('lists folders ordered by name', async () => {
    await postJson('/api/folders', { name: 'Zeta' })
    await postJson('/api/folders', { name: 'Alpha' })
    const res = await authedRequest(server, 'GET', '/api/folders')
    const list = res.json()
    expect(list.map(f => f.name)).toEqual(['Alpha', 'Zeta'])
  })

  it('returns 401 without auth', async () => {
    const res = await request(server, 'GET', '/api/folders')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/folders', () => {
  it('creates a folder', async () => {
    const res = await postJson('/api/folders', { name: 'Docs' })
    expect(res.status).toBe(201)
    expect(res.json().name).toBe('Docs')
    expect(res.json().parentId).toBeNull()
  })

  it('creates a nested folder', async () => {
    const parent = (await postJson('/api/folders', { name: 'Docs' })).json()
    const child = (await postJson('/api/folders', { name: 'Sub', parentId: parent.id })).json()
    expect(child.parentId).toBe(parent.id)
  })

  it('rejects missing name', async () => {
    const res = await postJson('/api/folders', { name: '' })
    expect(res.status).toBe(400)
  })

  it('rejects name with slash', async () => {
    const res = await postJson('/api/folders', { name: 'a/b' })
    expect(res.status).toBe(400)
  })

  it('rejects duplicate name within same parent', async () => {
    await postJson('/api/folders', { name: 'Docs' })
    const res = await postJson('/api/folders', { name: 'docs' })
    expect(res.status).toBe(409)
    expect(res.json().error.code).toBe('FOLDER_CONFLICT')
  })

  it('allows same name in different parents', async () => {
    const p1 = (await postJson('/api/folders', { name: 'A' })).json()
    const p2 = (await postJson('/api/folders', { name: 'B' })).json()
    const res = await postJson('/api/folders', { name: 'Same', parentId: p1.id })
    expect(res.status).toBe(201)
    const res2 = await postJson('/api/folders', { name: 'Same', parentId: p2.id })
    expect(res2.status).toBe(201)
  })
})

describe('PUT /api/folders/:id', () => {
  it('renames a folder', async () => {
    const f = (await postJson('/api/folders', { name: 'Old' })).json()
    const res = await putJson(`/api/folders/${f.id}`, { name: 'New' })
    expect(res.status).toBe(200)
    expect(res.json().name).toBe('New')
  })

  it('returns 404 for missing', async () => {
    const res = await putJson('/api/folders/999', { name: 'X' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/folders/:id', () => {
  it('deletes folder and moves its files to root', async () => {
    const f = (await postJson('/api/folders', { name: 'Docs' })).json()
    ctx.db.prepare('INSERT INTO files (filename, content, size_bytes, folder_id) VALUES (?, ?, ?, ?)')
      .run('a.md', 'x', 1, f.id)
    const res = await authedRequest(server, 'DELETE', `/api/folders/${f.id}`)
    expect(res.status).toBe(200)
    const folderList = await authedRequest(server, 'GET', '/api/folders')
    expect(folderList.json()).toEqual([])
    const fileList = (await authedRequest(server, 'GET', '/api/files')).json()
    expect(fileList[0].folderId).toBeNull()
  })

  it('cascades subfolders', async () => {
    const parent = (await postJson('/api/folders', { name: 'P' })).json()
    await postJson('/api/folders', { name: 'C', parentId: parent.id })
    await authedRequest(server, 'DELETE', `/api/folders/${parent.id}`)
    const list = (await authedRequest(server, 'GET', '/api/folders')).json()
    expect(list).toEqual([])
  })
})

describe('file folderId', () => {
  it('creates file inside a folder', async () => {
    const f = (await postJson('/api/folders', { name: 'Docs' })).json()
    const res = await postJson('/api/files', { filename: 'a.md', content: 'x', folderId: f.id })
    expect(res.status).toBe(201)
    expect(res.json().folderId).toBe(f.id)
  })

  it('filters files by folderId', async () => {
    const f = (await postJson('/api/folders', { name: 'Docs' })).json()
    await postJson('/api/files', { filename: 'in.md', content: 'x', folderId: f.id })
    await postJson('/api/files', { filename: 'root.md', content: 'x' })
    const res = await authedRequest(server, 'GET', `/api/files?folderId=${f.id}`)
    const list = res.json()
    expect(list).toHaveLength(1)
    expect(list[0].filename).toBe('in.md')
  })

  it('moves a file via POST /api/files/:id/move', async () => {
    const f = (await postJson('/api/folders', { name: 'Docs' })).json()
    const file = (await postJson('/api/files', { filename: 'a.md', content: 'x' })).json()
    const res = await authedRequest(server, 'POST', `/api/files/${file.id}/move`, { folderId: f.id })
    expect(res.status).toBe(200)
    expect(res.json().folderId).toBe(f.id)
    // move back to root
    const res2 = await authedRequest(server, 'POST', `/api/files/${file.id}/move`, { folderId: null })
    expect(res2.json().folderId).toBeNull()
  })
})
