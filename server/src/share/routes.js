export function registerShareRoutes(routes, { db }) {
  routes['GET /u/:filename'] = (req, res) => {
    const row = db.prepare(`
      SELECT filename, content, mime_type FROM files WHERE filename = ?
    `).get(req.params.filename)
    if (!row) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('Not found')
    }

    const mime = row.mime_type || 'text/plain; charset=utf-8'
    const isText = mime.startsWith('text/') || mime === 'application/json'

    if (isText) {
      // 包装成 HTML 页面，支持暗黑模式
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(row.filename)}</title>
  <style>
    :root {
      --bg: #ffffff;
      --text: #111827;
      --bg-code: #f8fafc;
      --border: #e2e8f0;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1a1a1a;
        --text: #e5e7eb;
        --bg-code: #1f2430;
        --border: #303746;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }
    .header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      opacity: 0.7;
    }
    .filename { font-weight: 600; }
    .content {
      padding: 20px;
      white-space: pre-wrap;
      word-break: break-all;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 14px;
      line-height: 1.5;
      background: var(--bg-code);
      min-height: calc(100vh - 45px);
    }
    .powered-by {
      position: fixed;
      bottom: 12px;
      right: 16px;
      font-size: 12px;
      opacity: 0.5;
      color: var(--text);
    }
    .powered-by a {
      color: inherit;
      text-decoration: none;
    }
    .powered-by a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="header">
    <span>📄</span>
    <span class="filename">${escapeHtml(row.filename)}</span>
  </div>
  <div class="content">${escapeHtml(row.content)}</div>
  <div class="powered-by">
    Shared via <a href="/" target="_blank">TopFiles</a>
  </div>
</body>
</html>`
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      })
      res.end(html)
    } else {
      // 非文本文件直接返回
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Disposition': `inline; filename="${encodeURIComponent(row.filename)}"`,
        'Cache-Control': 'public, max-age=60',
      })
      res.end(row.content)
    }
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}