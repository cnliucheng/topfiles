// 分享内容与应用同源。若按其 MIME 类型内联，脚本可在带会话 Cookie 的上下文调用 /api/*。
// 固定按纯文本返回，确保任何文件都不会被浏览器解释或执行。
const SHARE_CONTENT_TYPE = 'text/plain; charset=utf-8'

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
      'Content-Type': SHARE_CONTENT_TYPE,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.filename)}"`,
      'Cache-Control': 'public, max-age=60',
    })
    res.end(row.content)
  }
}
