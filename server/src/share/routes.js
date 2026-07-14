// 浏览器会内联解析并执行脚本的内容类型。分享接口按 GitHub raw 的做法降级为纯文本，
// 避免同源存储型 XSS--分享页 /u/<filename> 与主应用同源，若让浏览器执行文件里的 JS，
// 可代替登录用户调用 /api/*（cookie 虽 HttpOnly 不可读，但可被同源请求带上）。
function safeContentType(mime) {
  const m = (mime || 'text/plain; charset=utf-8').toLowerCase()
  if (m.startsWith('text/html') || m.startsWith('application/xhtml') || m.startsWith('image/svg')) {
    return 'text/plain; charset=utf-8'
  }
  return mime || 'text/plain; charset=utf-8'
}

export function registerShareRoutes(routes, { db }) {
  routes['GET /u/:filename'] = (req, res) => {
    const row = db.prepare(`
      SELECT filename, content, mime_type FROM files WHERE filename = ?
    `).get(req.params.filename)
    if (!row) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('Not found')
    }
    res.writeHead(200, {
      'Content-Type': safeContentType(row.mime_type),
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.filename)}"`,
      'Cache-Control': 'public, max-age=60',
    })
    res.end(row.content)
  }
}
