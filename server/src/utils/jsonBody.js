const MAX_JSON = 1024 * 1024 + 1024

export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', c => {
      buf += c
      if (buf.length > MAX_JSON) { req.destroy(); reject(new Error('too large')) }
    })
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}) } catch { reject(new Error('invalid json')) }
    })
    req.on('error', reject)
  })
}
