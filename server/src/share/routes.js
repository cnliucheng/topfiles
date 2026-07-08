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
      'Content-Type': row.mime_type || 'text/plain; charset=utf-8',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.filename)}"`,
      'Cache-Control': 'public, max-age=60',
    })
    res.end(row.content)
  }
}