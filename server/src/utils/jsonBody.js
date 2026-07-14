import { AppError } from '../errors.js'

const MAX_JSON = 1024 * 1024 + 1024

export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', c => {
      buf += c
      if (buf.length > MAX_JSON) {
        req.destroy()
        reject(new AppError(413, 'CONTENT_TOO_LARGE', '请求体超出 1MB 限制'))
      }
    })
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}) } catch { reject(new AppError(400, 'INVALID_JSON', '请求体不是合法 JSON')) }
    })
    req.on('error', reject)
  })
}
