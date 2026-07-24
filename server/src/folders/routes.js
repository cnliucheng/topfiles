import { sendJson } from '../utils/json.js'
import { AppError } from '../errors.js'
import { authenticate } from '../auth/session.js'
import { readJsonBody } from '../utils/jsonBody.js'

const INVALID_FOLDER_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g

function normalizeFolderName(name) {
  return String(name ?? '')
    .trim()
    .replace(/\.+$/g, '')
    .replace(/\s+$/g, '')
}

export function registerFolderRoutes(routes, { db, secret }) {
  /* ===== GET /api/folders — list all folders ===== */
  routes['GET /api/folders'] = async (req, res) => {
    await authenticate(req, secret)
    const rows = db.prepare(`
      SELECT id, name, parent_id as parentId, created_at as createdAt
      FROM folders ORDER BY name COLLATE NOCASE ASC
    `).all()
    sendJson(res, 200, rows)
  }

  /* ===== POST /api/folders — create folder ===== */
  routes['POST /api/folders'] = async (req, res) => {
    await authenticate(req, secret)
    const body = await readJsonBody(req)
    const name = normalizeFolderName(body.name)
    if (!name) throw new AppError(400, 'INVALID_REQUEST', '文件夹名称必填')
    if (INVALID_FOLDER_CHARS.test(name)) throw new AppError(400, 'INVALID_REQUEST', '文件夹名称含非法字符')
    if (name.length > 120) throw new AppError(400, 'INVALID_REQUEST', '文件夹名称过长')

    const parentId = body.parentId != null ? Number(body.parentId) : null
    if (parentId != null) {
      if (!Number.isInteger(parentId) || parentId <= 0) throw new AppError(400, 'INVALID_REQUEST', 'parentId 非法')
      const parent = db.prepare('SELECT id FROM folders WHERE id = ?').get(parentId)
      if (!parent) throw new AppError(404, 'FOLDER_NOT_FOUND', '父文件夹不存在')
    }

    if (existsFolder(db, name, parentId)) {
      throw new AppError(409, 'FOLDER_CONFLICT', '同级已存在同名文件夹')
    }

    try {
      const info = db.prepare('INSERT INTO folders (name, parent_id) VALUES (?, ?)').run(name, parentId)
      const row = db.prepare(`
        SELECT id, name, parent_id as parentId, created_at as createdAt FROM folders WHERE id = ?
      `).get(info.lastInsertRowid)
      sendJson(res, 201, row)
    } catch (e) {
      if (String(e).includes('UNIQUE')) throw new AppError(409, 'FOLDER_CONFLICT', '同级已存在同名文件夹')
      throw e
    }
  }

  /* ===== PUT /api/folders/:id — rename folder ===== */
  routes['PUT /api/folders/:id'] = async (req, res) => {
    await authenticate(req, secret)
    const id = +req.params.id
    const body = await readJsonBody(req)
    const name = normalizeFolderName(body.name)
    if (!name) throw new AppError(400, 'INVALID_REQUEST', '文件夹名称必填')
    if (INVALID_FOLDER_CHARS.test(name)) throw new AppError(400, 'INVALID_REQUEST', '文件夹名称含非法字符')

    const folder = db.prepare('SELECT id, parent_id as parentId FROM folders WHERE id = ?').get(id)
    if (!folder) throw new AppError(404, 'FOLDER_NOT_FOUND', '文件夹不存在')

    if (existsFolder(db, name, folder.parentId, id)) {
      throw new AppError(409, 'FOLDER_CONFLICT', '同级已存在同名文件夹')
    }

    db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id)
    const row = db.prepare(`
      SELECT id, name, parent_id as parentId, created_at as createdAt FROM folders WHERE id = ?
    `).get(id)
    sendJson(res, 200, row)
  }

  /* ===== DELETE /api/folders/:id — delete folder ===== */
  routes['DELETE /api/folders/:id'] = async (req, res) => {
    await authenticate(req, secret)
    const id = +req.params.id
    const folder = db.prepare('SELECT id FROM folders WHERE id = ?').get(id)
    if (!folder) throw new AppError(404, 'FOLDER_NOT_FOUND', '文件夹不存在')
    // 子文件夹级联删除；文件 folder_id 置空（回退到根目录）
    db.prepare('DELETE FROM folders WHERE id = ?').run(id)
    sendJson(res, 200, { ok: true, id })
  }

  /* ===== POST /api/files/:id/move — move file into / out of a folder ===== */
  routes['POST /api/files/:id/move'] = async (req, res) => {
    await authenticate(req, secret)
    const id = +req.params.id
    const body = await readJsonBody(req)
    const folderId = body.folderId != null ? Number(body.folderId) : null

    const file = db.prepare('SELECT id FROM files WHERE id = ?').get(id)
    if (!file) throw new AppError(404, 'NOT_FOUND', '文件不存在')

    let target = null
    if (folderId != null) {
      if (!Number.isInteger(folderId) || folderId <= 0) throw new AppError(400, 'INVALID_REQUEST', 'folderId 非法')
      target = db.prepare('SELECT id FROM folders WHERE id = ?').get(folderId)
      if (!target) throw new AppError(404, 'FOLDER_NOT_FOUND', '目标文件夹不存在')
    }

    db.prepare('UPDATE files SET folder_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(target ? folderId : null, id)
    const row = db.prepare(`
      SELECT id, filename, mime_type as mimeType, size_bytes as sizeBytes,
             created_at as createdAt, updated_at as updatedAt, folder_id as folderId
      FROM files WHERE id = ?
    `).get(id)
    sendJson(res, 200, row)
  }
}

function existsFolder(db, name, parentId, exceptId = null) {
  let row
  if (parentId == null) {
    const q = exceptId != null
      ? 'SELECT id FROM folders WHERE name = ? COLLATE NOCASE AND parent_id IS NULL AND id != ?'
      : 'SELECT id FROM folders WHERE name = ? COLLATE NOCASE AND parent_id IS NULL'
    row = exceptId != null
      ? db.prepare(q).get(name, exceptId)
      : db.prepare(q).get(name)
  } else {
    const q = exceptId != null
      ? 'SELECT id FROM folders WHERE name = ? COLLATE NOCASE AND parent_id = ? AND id != ?'
      : 'SELECT id FROM folders WHERE name = ? COLLATE NOCASE AND parent_id = ?'
    row = exceptId != null
      ? db.prepare(q).get(name, parentId, exceptId)
      : db.prepare(q).get(name, parentId)
  }
  return !!row
}
