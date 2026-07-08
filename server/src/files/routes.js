import { sendJson } from '../utils/json.js'
import { AppError } from '../errors.js'
import { parseCookies } from '../auth/cookies.js'
import { readJsonBody } from '../utils/jsonBody.js'
import { sniffMime } from '../utils/mime.js'

const MAX_CONTENT = 1024 * 1024

function requireAuth(req) {
  const cookies = parseCookies(req.headers.cookie)
  if (!cookies.tf_session) throw new AppError(401, 'UNAUTHENTICATED', '请先登录')
}

export function registerFileRoutes(routes, { db }) {
  routes['GET /api/files'] = (req, res) => {
    requireAuth(req)
    const rows = db.prepare(`
      SELECT id, filename, mime_type as mimeType, size_bytes as sizeBytes,
             created_at as createdAt, updated_at as updatedAt
      FROM files ORDER BY updated_at DESC
    `).all()
    sendJson(res, 200, rows)
  }

  routes['POST /api/files'] = async (req, res) => {
    requireAuth(req)
    const body = await readJsonBody(req)
    const { filename, content, mimeType } = body
    if (!filename) throw new AppError(400, 'INVALID_REQUEST', '文件名必填')
    if (typeof content !== 'string') throw new AppError(400, 'INVALID_REQUEST', 'content 必填')
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT) {
      throw new AppError(413, 'CONTENT_TOO_LARGE', '内容超出 1MB 限制')
    }
    try {
      const info = db.prepare(`
        INSERT INTO files (filename, content, mime_type, size_bytes)
        VALUES (?, ?, ?, ?)
      `).run(filename, content, mimeType || sniffMime(filename), Buffer.byteLength(content, 'utf8'))
      const row = db.prepare(`
        SELECT id, filename, mime_type as mimeType, size_bytes as sizeBytes,
               created_at as createdAt, updated_at as updatedAt
        FROM files WHERE id = ?
      `).get(info.lastInsertRowid)
      sendJson(res, 201, row)
    } catch (e) {
      if (String(e).includes('UNIQUE')) throw new AppError(409, 'FILENAME_CONFLICT', '同名文件已存在')
      throw e
    }
  }

  routes['GET /api/files/:id'] = (req, res) => {
    requireAuth(req)
    const id = +req.params.id
    const row = db.prepare(`
      SELECT id, filename, content, mime_type as mimeType, size_bytes as sizeBytes,
             created_at as createdAt, updated_at as updatedAt
      FROM files WHERE id = ?
    `).get(id)
    if (!row) throw new AppError(404, 'NOT_FOUND', '文件不存在')
    sendJson(res, 200, row)
  }

  routes['PUT /api/files/:id'] = async (req, res) => {
    requireAuth(req)
    const id = +req.params.id
    const body = await readJsonBody(req)
    const { content, mimeType } = body
    if (typeof content !== 'string') throw new AppError(400, 'INVALID_REQUEST', 'content 必填')
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT) {
      throw new AppError(413, 'CONTENT_TOO_LARGE', '内容超出 1MB 限制')
    }
    const existing = db.prepare('SELECT * FROM files WHERE id = ?').get(id)
    if (!existing) throw new AppError(404, 'NOT_FOUND', '文件不存在')
    db.prepare(`
      UPDATE files SET content = ?, mime_type = ?, size_bytes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(content, mimeType || existing.mime_type, Buffer.byteLength(content, 'utf8'), id)
    const row = db.prepare(`
      SELECT id, filename, mime_type as mimeType, size_bytes as sizeBytes,
             created_at as createdAt, updated_at as updatedAt
      FROM files WHERE id = ?
    `).get(id)
    sendJson(res, 200, row)
  }

  routes['DELETE /api/files/:id'] = (req, res) => {
    requireAuth(req)
    db.prepare('DELETE FROM files WHERE id = ?').run(+req.params.id)
    res.writeHead(204); res.end()
  }
}
