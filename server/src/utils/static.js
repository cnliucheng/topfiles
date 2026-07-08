import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { sniffMime } from './mime.js'

export async function serveStatic(req, res, path, root) {
  try {
    let filePath = join(root, path === '/' ? '/index.html' : path)
    let st
    try { st = await stat(filePath) } catch {
      // SPA fallback
      filePath = join(root, 'index.html')
      st = await stat(filePath)
    }
    if (st.isDirectory()) {
      filePath = join(filePath, 'index.html')
    }
    const data = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': sniffMime(filePath),
      'Cache-Control': 'public, max-age=300',
    })
    res.end(data)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  }
}