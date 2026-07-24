import { sendJson } from '../utils/json.js'
import { AppError } from '../errors.js'
import { authenticate } from '../auth/session.js'
import { readJsonBody } from '../utils/jsonBody.js'
import { sniffMime } from '../utils/mime.js'

const MAX_CONTENT = 1024 * 1024

export function registerFileRoutes(routes, { db, secret }) {
  routes['GET /api/files'] = async (req, res) => {
    await authenticate(req, secret)
    const url = new URL(req.url, 'http://x')
    const folderIdRaw = url.searchParams.get('folderId')
    let where = ''
    let params = []
    if (folderIdRaw !== null) {
      if (folderIdRaw === 'root' || folderIdRaw === '0' || folderIdRaw === '') {
        where = 'WHERE folder_id IS NULL'
      } else {
        const fid = Number(folderIdRaw)
        if (Number.isInteger(fid) && fid > 0) {
          where = 'WHERE folder_id = ?'
          params = [fid]
        }
      }
    }
    const rows = db.prepare(`
      SELECT id, filename, mime_type as mimeType, size_bytes as sizeBytes,
             created_at as createdAt, updated_at as updatedAt, folder_id as folderId
      FROM files ${where} ORDER BY updated_at DESC
    `).all(...params)
    sendJson(res, 200, rows)
  }

  routes['POST /api/files'] = async (req, res) => {
    await authenticate(req, secret)
    const body = await readJsonBody(req)
    const { filename, content, mimeType } = body
    if (!filename) throw new AppError(400, 'INVALID_REQUEST', '文件名必填')
    if (typeof content !== 'string') throw new AppError(400, 'INVALID_REQUEST', 'content 必填')
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT) {
      throw new AppError(413, 'CONTENT_TOO_LARGE', '内容超出 1MB 限制')
    }
    let folderId = null
    if (body.folderId != null) {
      folderId = Number(body.folderId)
      if (!Number.isInteger(folderId) || folderId <= 0) throw new AppError(400, 'INVALID_REQUEST', 'folderId 非法')
      const folder = db.prepare('SELECT id FROM folders WHERE id = ?').get(folderId)
      if (!folder) throw new AppError(404, 'FOLDER_NOT_FOUND', '目标文件夹不存在')
    }
    try {
      const info = db.prepare(`
        INSERT INTO files (filename, content, mime_type, size_bytes, folder_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(filename, content, mimeType || sniffMime(filename), Buffer.byteLength(content, 'utf8'), folderId)
      const row = db.prepare(`
        SELECT id, filename, mime_type as mimeType, size_bytes as sizeBytes,
               created_at as createdAt, updated_at as updatedAt, folder_id as folderId
        FROM files WHERE id = ?
      `).get(info.lastInsertRowid)
      sendJson(res, 201, row)
    } catch (e) {
      if (String(e).includes('UNIQUE')) throw new AppError(409, 'FILENAME_CONFLICT', '同名文件已存在')
      throw e
    }
  }

  routes['GET /api/files/:id'] = async (req, res) => {
    await authenticate(req, secret)
    const id = +req.params.id
    const row = db.prepare(`
      SELECT id, filename, content, mime_type as mimeType, size_bytes as sizeBytes,
             created_at as createdAt, updated_at as updatedAt, folder_id as folderId
      FROM files WHERE id = ?
    `).get(id)
    if (!row) throw new AppError(404, 'NOT_FOUND', '文件不存在')
    sendJson(res, 200, row)
  }

  routes['PUT /api/files/:id'] = async (req, res) => {
    await authenticate(req, secret)
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

  routes['DELETE /api/files/:id'] = async (req, res) => {
    await authenticate(req, secret)
    db.prepare('DELETE FROM files WHERE id = ?').run(+req.params.id)
    res.writeHead(204); res.end()
  }
}
