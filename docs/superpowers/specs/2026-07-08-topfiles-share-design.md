# TopFiles 分享功能 — 安全+最简版设计

**日期**：2026-07-08
**状态**：设计稿（待实施）
**作者**：与 Claude 协作完成

---

## 1. 背景与目标

### 1.1 项目现状

`TopFiles` 是一个基于 Vue 3 + Vite + TypeScript + CodeMirror 6 的纯前端在线文件编辑工具。

**当前限制**：无后端、无账号、无云存储、无分享链接。

### 1.2 目标

为 TopFiles 增加"在线分享"能力：

- 首次访问引导注册（**全站只允许一个账号**）
- 登录后单页布局：左侧文件列表 + 右侧编辑器
- 编辑完点"保存" → 入库
- 点"分享" → 生成可读直链 `https://app/u/<filename>`
- 直链任何人可访问，文本内容直接展示
- 未登录访问首页 → 显示"创建账号"或"登录"页面

### 1.3 范围

**MVP 范围（in）**：
- 首次访问引导注册（单账号）
- 用户名 + 密码登录（bcrypt 哈希）
- 登录后单页布局：左侧文件列表 + 右侧编辑器
- 创建/编辑/删除文件
- 可读直链 `/u/<filename>`
- 单进程部署

**MVP 不做（out）**：
- 多用户注册
- GitHub OAuth / 第三方登录
- 二进制文件
- 文件夹/层级
- 文件搜索/分页/筛选
- refresh token / 自动续期（JWT 过期重登即可）
- 文件私密/公开切换（默认全公开）

---

## 2. 关键决策

| 维度 | 决策 | 理由 |
|---|---|---|
| 账号模式 | 单账号（首次访问引导注册） | 个人项目 |
| 认证 | 用户名 + 密码（bcrypt） | 安全 + 无第三方依赖 |
| Token | JWT 签名 cookie（无 refresh） | 简化；过期重登 |
| 文件范围 | 只支持文本，限 1MB | 覆盖笔记/代码/配置 95% 场景 |
| 存储 | 全部 SQLite，**不引入 S3** | 内容直接存 TEXT 字段 |
| 持久化 | 直写 SQL（不用 ORM） | 2 张表，5 个查询 |
| 框架 | **Node 原生 http**（不用 Fastify） | 单文件 150 行搞定 |
| 直链格式 | `/u/<filename>` | 单用户无需用户名段，更短 |
| 部署 | 单 Node 进程 + 单 .db 文件 | 极简 |

---

## 3. 架构总览

```
┌──────────────────────────────────────────────┐
│         浏览器 (Vue 3 单页应用)              │
│  未登录：注册 / 登录                          │
│  登录后：侧边栏 + 编辑器                      │
└────────────────┬─────────────────────────────┘
                 │ HTTPS (httpOnly cookie)
                 ▼
┌──────────────────────────────────────────────┐
│   Node http (server.js，单文件 ~150 行)      │
│   - 路由分发                                  │
│   - 静态文件 serve                            │
│   - JWT 验证                                 │
└──────────────────────┬───────────────────────┘
                       │ better-sqlite3
                       ▼
              ┌─────────────────┐
              │  SQLite         │
              │  (data.db)      │
              └─────────────────┘
```

**依赖清单（3 个）**：
- `better-sqlite3`：同步 SQLite 驱动
- `bcryptjs`：密码哈希
- `jose`：JWT 签名/验证

---

## 4. 数据模型

### 4.1 表结构

```sql
-- 1. 账号表（永远 1 行）
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY CHECK (id = 1),  -- 数据库层强制单账号
  username       TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash  TEXT NOT NULL,                       -- bcrypt
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. 文件表
CREATE TABLE IF NOT EXISTS files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  filename     TEXT UNIQUE NOT NULL COLLATE NOCASE,
  mime_type    TEXT NOT NULL DEFAULT 'text/plain',
  content      TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_files_updated ON files(updated_at DESC);
```

### 4.2 单账号强制

- `users.id` 加 `CHECK (id = 1)` — 阻止插入第二行
- 注册时 `INSERT ... WHERE NOT EXISTS (SELECT 1 FROM users)`
- 无 sessions 表（无 refresh token，JWT 7 天过期，重登即可）

### 4.3 关键设计点

| 点 | 理由 |
|---|---|
| `users.id` CHECK 约束 | 数据库层强制单账号 |
| `files.filename` COLLATE NOCASE UNIQUE | `Notes.md` 与 `notes.md` 视为同一 |
| `content` 直接存 TEXT | 文本小，< 1MB |
| `size_bytes` 冗余 | 列表展示用 |
| `WAL 模式` (`PRAGMA journal_mode=WAL`) | 读写并发 |

---

## 5. API 设计

所有 JSON API 走 `/api/*`，公开直链走 `/u/*`。

### 5.1 系统状态

```
GET /api/setup/status
  → 200 { hasAccount: boolean }
```

### 5.2 认证

```
POST /api/auth/setup
  body: { username, password }
  → 201 { username }     首次注册成功
  → 409 ALREADY_INITIALIZED  已有账号

POST /api/auth/login
  body: { username, password }
  → 200 { username }     种 cookie
  → 401 INVALID_CREDENTIALS  用户名或密码错

POST /api/auth/logout
  → 204    清 cookie

GET /api/auth/me
  → 200 { username }    已登录
  → 401                  未登录
```

### 5.3 文件 CRUD

```
GET    /api/files                  列出所有文件
       → 200 [{ id, filename, mimeType, sizeBytes, updatedAt }, ...]

POST   /api/files
       body: { filename, content, mimeType? }
       → 201 { id, filename, ... }
       → 409 FILENAME_CONFLICT     同名文件
       → 413 CONTENT_TOO_LARGE     > 1MB

GET    /api/files/:id
       → 200 { id, filename, content, mimeType, sizeBytes, updatedAt }

PUT    /api/files/:id
       body: { content, mimeType? }
       → 200 { id, filename, ... }

DELETE /api/files/:id
       → 204
```

### 5.4 公开直链

```
GET /u/:filename
  → 200    Content-Type: <mime>
            Content-Disposition: inline; filename="..."
            Body: 文件内容
  → 404    文件不存在
```

### 5.5 错误格式

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "用户名或密码错误" } }
```

### 5.6 状态码

| 码 | 场景 |
|---|---|
| 200/201/204 | 成功 |
| 400 | 参数缺失或格式错 |
| 401 | 未登录 / 凭据错 |
| 404 | 文件不存在 |
| 409 | 冲突（已注册/同名文件） |
| 413 | 内容 > 1MB |
| 500 | 未预期错误 |

---

## 6. 鉴权流程

### 6.1 注册（仅一次）

```
首次访问：
  GET /api/setup/status → { hasAccount: false }
  → 前端显示"创建账号"表单

提交注册：
  POST /api/auth/setup { username, password }
  服务端：
    1. 查 users 表 → 非空？409 ALREADY_INITIALIZED
    2. 校验 username（3-32 位，[a-z0-9_-]）
    3. 校验 password（≥ 8 位）
    4. bcrypt.hash(password, 12) → 存 users 表（id=1）
    5. 签 JWT（payload: { sub: 'user:1', username }, exp: +7d）
    6. Set-Cookie: tf_session=<jwt>; HttpOnly; Secure; SameSite=Lax
    7. 201 { username }
  → 前端进入主界面
```

### 6.2 登录

```
POST /api/auth/login { username, password }
  服务端：
    1. 查 user by username
    2. bcrypt.compare(password, user.password_hash)
    3. 失败 → 401 INVALID_CREDENTIALS（统一消息，不区分"用户不存在"）
    4. 成功 → 签 JWT → Set-Cookie
    5. 200 { username }
```

### 6.3 已登录态

```
前端调任何 /api/* 请求时：
  - 浏览器自动带 tf_session cookie
  - 服务端 JWT verify → 取 sub/username
  - 放行 / 401
```

### 6.4 JWT 配置

```javascript
// 启动时
const jwt = await new SignJWT({ sub: 'user:1', username })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('7d')
  .sign(new TextEncoder().encode(process.env.JWT_SECRET))

// 验证
const { payload } = await jwtVerify(jwt, new TextEncoder().encode(JWT_SECRET))
```

### 6.5 安全清单

- [x] 密码 bcrypt cost=12
- [x] 密码最少 8 位
- [x] 用户名 3-32 位，`[a-z0-9_-]`
- [x] JWT HS256 + 强密钥
- [x] cookie `HttpOnly; Secure; SameSite=Lax`
- [x] 单账号 CHECK 约束
- [x] 登录失败统一消息（不区分"用户不存在"和"密码错"）
- [x] 限流：登录/setup 每 IP 每分钟 5 次
- [x] SQL 参数化（防注入）

### 6.6 环境变量

```bash
PORT=3000
JWT_SECRET=<32 字节随机>
COOKIE_SECURE=true      # 生产必须 true，开发可 false
COOKIE_DOMAIN=          # 留空用当前域
```

---

## 7. 前端改造

### 7.1 单页三态

整个 App 就一个组件，根据状态显示不同视图：

```vue
<!-- App.vue -->
<template>
  <SetupView v-if="!isInitialized" />
  <LoginView v-else-if="!user" />
  <MainView v-else />
</template>
```

```
未注册（isInitialized=false）：
┌────────────────────────────────┐
│       TopFiles                 │
│   欢迎使用，请创建账号         │
│   [用户名________]             │
│   [密码________]               │
│   [确认密码________]           │
│   [    创建账号    ]           │
└────────────────────────────────┘

未登录（hasAccount=true, user=null）：
┌────────────────────────────────┐
│       TopFiles                 │
│   [用户名________]             │
│   [密码________]               │
│   [    登录    ]               │
└────────────────────────────────┘

已登录（user!=null）：
┌──────────────────────────────────────────────────┐
│  TopFiles                          [保存] [分享]  │
├────────────┬─────────────────────────────────────┤
│ [+ 新建]   │  文件名：[a.md            ]         │
│            │  ─────────────────────────────────  │
│ 📄 a.md    │                                     │
│ 📄 b.yml   │  [CodeMirror 编辑区]                │
│ 📄 c.json  │                                     │
│            │                                     │
│ ⚙️ 注销   │                                     │
└────────────┴─────────────────────────────────────┘
```

### 7.2 状态管理（Pinia / composable）

```typescript
// src/stores/auth.ts
export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ username: string } | null>(null)
  const isInitialized = ref<boolean | null>(null)  // null = 还在检查
  
  async function init() {
    const { hasAccount } = await api.get('/api/setup/status')
    isInitialized.value = hasAccount
    if (hasAccount) {
      try { user.value = await api.get('/api/auth/me') } catch {}
    }
  }
  
  async function setup(username: string, password: string) {
    await api.post('/api/auth/setup', { username, password })
    isInitialized.value = true
    user.value = { username }
  }
  
  async function login(username: string, password: string) {
    const me = await api.post('/api/auth/login', { username, password })
    user.value = me
  }
  
  async function logout() {
    await api.post('/api/auth/logout')
    user.value = null
  }
  
  return { user, isInitialized, init, setup, login, logout }
})
```

```typescript
// src/stores/files.ts
export const useFilesStore = defineStore('files', () => {
  const list = ref<FileMeta[]>([])
  const current = ref<FileDetail | null>(null)
  
  async function fetchList() {
    list.value = await api.get('/api/files')
  }
  async function create(payload: { filename: string; content: string; mimeType?: string }) {
    const f = await api.post('/api/files', payload)
    list.value.unshift(f)
    current.value = f
    return f
  }
  async function update(id: number, payload: { content: string; mimeType?: string }) {
    const f = await api.put(`/api/files/${id}`, payload)
    if (current.value?.id === id) current.value = f
    await fetchList()
    return f
  }
  async function remove(id: number) {
    await api.delete(`/api/files/${id}`)
    if (current.value?.id === id) current.value = null
    list.value = list.value.filter(f => f.id !== id)
  }
  async function loadFile(id: number) {
    current.value = await api.get(`/api/files/${id}`)
  }
  
  return { list, current, fetchList, create, update, remove, loadFile }
})
```

### 7.3 API 客户端

```typescript
// src/api/client.ts
import axios from 'axios'

export const api = axios.create({
  baseURL: '',         // 同源部署
  withCredentials: true,
})

// 401 自动跳登录（无 refresh，靠重登）
api.interceptors.response.use(null, (err) => {
  if (err.response?.status === 401 && !window.location.pathname.startsWith('/u/')) {
    // 简单粗暴：清状态让 App 跳 LoginView
    window.dispatchEvent(new CustomEvent('auth:expired'))
  }
  return Promise.reject(err)
})
```

### 7.4 三个视图组件

| 组件 | 作用 | 显示条件 |
|---|---|---|
| `SetupView.vue` | 首次注册表单 | `isInitialized === false` |
| `LoginView.vue` | 登录表单 | `isInitialized === true && !user` |
| `MainView.vue` | 侧边栏 + 编辑器 + 分享弹窗 | `user` 已登录 |

### 7.5 分享弹窗

```vue
<Modal v-model:open="open">
  <h2>分享文件</h2>
  <p>任何人可通过以下链接访问：</p>
  <CopyableInput :value="shareUrl" />
  <p class="hint">文件当前为公开（TopFiles 默认所有文件可分享）</p>
</Modal>
```

由于默认公开，分享就是直接展示直链，无开关。

### 7.6 与现有草稿兼容

```
未登录用户：完全使用现有功能
  - 编辑 → localStorage 草稿
  - 下载按钮照常
  - "保存" / "分享" 按钮置灰，hover 提示"登录后可用"

登录用户：进入 MainView，云端为正本
  - 现有编辑器组件原样复用
  - 现有 localStorage 草稿作为"未保存前"本地缓存
  - 显式 "保存" 才入库
```

---

## 8. 后端实现示例

### 8.1 依赖（package.json）

```json
{
  "name": "topfiles-server",
  "type": "module",
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "bcryptjs": "^2.4.3",
    "jose": "^5.0.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

### 8.2 server.js（完整示意）

```javascript
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

// --- 配置 ---
const PORT = process.env.PORT || 3000
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-only-change-me-32-bytes!!')
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true'
const STATIC_DIR = resolve(process.env.STATIC_DIR || '../dist')
const DB_PATH = process.env.DB_PATH || './data.db'
const MAX_CONTENT = 1024 * 1024  // 1MB

// --- DB ---
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT UNIQUE NOT NULL COLLATE NOCASE,
    mime_type TEXT NOT NULL DEFAULT 'text/plain',
    content TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_files_updated ON files(updated_at DESC);
`)

// --- 工具 ---
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}
const err = (res, status, code, message) =>
  json(res, status, { error: { code, message } })

const setSessionCookie = (res, jwt) => {
  const maxAge = 7 * 24 * 3600
  const parts = [
    `tf_session=${jwt}`,
    'HttpOnly',
    'SameSite=Lax',
    `Path=/`,
    `Max-Age=${maxAge}`,
  ]
  if (COOKIE_SECURE) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}
const clearSessionCookie = (res) => {
  res.setHeader('Set-Cookie', 'tf_session=; HttpOnly; Path=/; Max-Age=0')
}

const parseCookies = (header = '') =>
  Object.fromEntries(header.split(';').map(c => {
    const [k, ...v] = c.trim().split('=')
    return [k, decodeURIComponent(v.join('='))]
  }))

const getAuth = async (req) => {
  const cookies = parseCookies(req.headers.cookie)
  if (!cookies.tf_session) return null
  try {
    const { payload } = await jwtVerify(cookies.tf_session, JWT_SECRET)
    return payload
  } catch { return null }
}

const readJson = (req) => new Promise((resolve, reject) => {
  let buf = ''
  req.on('data', c => {
    buf += c
    if (buf.length > MAX_CONTENT + 1024) { req.destroy(); reject(new Error('too large')) }
  })
  req.on('end', () => {
    try { resolve(buf ? JSON.parse(buf) : {}) } catch (e) { reject(e) }
  })
})

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
}
const sniffMime = (filename) => MIME[extname(filename).toLowerCase()] || 'text/plain; charset=utf-8'

// --- 路由 ---
const routes = {
  'GET /api/setup/status': async (req, res) => {
    const row = db.prepare('SELECT COUNT(*) as n FROM users').get()
    json(res, 200, { hasAccount: row.n > 0 })
  },

  'POST /api/auth/setup': async (req, res) => {
    const { username, password } = await readJson(req)
    if (!username || !password) return err(res, 400, 'INVALID_REQUEST', '用户名和密码必填')
    if (!/^[a-z0-9_-]{3,32}$/i.test(username)) return err(res, 400, 'INVALID_USERNAME', '用户名 3-32 位，字母数字 _ -')
    if (password.length < 8) return err(res, 400, 'WEAK_PASSWORD', '密码至少 8 位')
    const n = db.prepare('SELECT COUNT(*) as n FROM users').get().n
    if (n > 0) return err(res, 409, 'ALREADY_INITIALIZED', '已存在账号')
    const hash = await bcrypt.hash(password, 12)
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)').run(username, hash)
    const jwt = await new SignJWT({ sub: 'user:1', username }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(JWT_SECRET)
    setSessionCookie(res, jwt)
    json(res, 201, { username })
  },

  'POST /api/auth/login': async (req, res) => {
    const { username, password } = await readJson(req)
    if (!username || !password) return err(res, 400, 'INVALID_REQUEST', '用户名和密码必填')
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
    if (!user) return err(res, 401, 'INVALID_CREDENTIALS', '用户名或密码错误')
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return err(res, 401, 'INVALID_CREDENTIALS', '用户名或密码错误')
    const jwt = await new SignJWT({ sub: 'user:1', username: user.username }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(JWT_SECRET)
    setSessionCookie(res, jwt)
    json(res, 200, { username: user.username })
  },

  'POST /api/auth/logout': async (req, res) => {
    clearSessionCookie(res)
    res.writeHead(204); res.end()
  },

  'GET /api/auth/me': async (req, res) => {
    const auth = await getAuth(req)
    if (!auth) return err(res, 401, 'UNAUTHENTICATED', '请先登录')
    json(res, 200, { username: auth.username })
  },

  'GET /api/files': async (req, res) => {
    const auth = await getAuth(req)
    if (!auth) return err(res, 401, 'UNAUTHENTICATED', '请先登录')
    const rows = db.prepare('SELECT id, filename, mime_type as mimeType, size_bytes as sizeBytes, updated_at as updatedAt FROM files ORDER BY updated_at DESC').all()
    json(res, 200, rows)
  },

  'POST /api/files': async (req, res) => {
    const auth = await getAuth(req)
    if (!auth) return err(res, 401, 'UNAUTHENTICATED', '请先登录')
    const { filename, content, mimeType } = await readJson(req)
    if (!filename) return err(res, 400, 'INVALID_REQUEST', '文件名必填')
    if (typeof content !== 'string') return err(res, 400, 'INVALID_REQUEST', 'content 必填')
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT) return err(res, 413, 'CONTENT_TOO_LARGE', '内容超出 1MB')
    try {
      const info = db.prepare('INSERT INTO files (filename, content, mime_type, size_bytes) VALUES (?, ?, ?, ?)')
        .run(filename, content, mimeType || sniffMime(filename), Buffer.byteLength(content, 'utf8'))
      const row = db.prepare('SELECT id, filename, mime_type as mimeType, size_bytes as sizeBytes, updated_at as updatedAt FROM files WHERE id = ?').get(info.lastInsertRowid)
      json(res, 201, row)
    } catch (e) {
      if (String(e).includes('UNIQUE')) return err(res, 409, 'FILENAME_CONFLICT', '同名文件已存在')
      throw e
    }
  },

  'GET /api/files/:id': async (req, res) => {
    const auth = await getAuth(req)
    if (!auth) return err(res, 401, 'UNAUTHENTICATED', '请先登录')
    const row = db.prepare('SELECT id, filename, content, mime_type as mimeType, size_bytes as sizeBytes, updated_at as updatedAt FROM files WHERE id = ?').get(+req.params.id)
    if (!row) return err(res, 404, 'NOT_FOUND', '文件不存在')
    json(res, 200, row)
  },

  'PUT /api/files/:id': async (req, res) => {
    const auth = await getAuth(req)
    if (!auth) return err(res, 401, 'UNAUTHENTICATED', '请先登录')
    const { content, mimeType } = await readJson(req)
    if (typeof content !== 'string') return err(res, 400, 'INVALID_REQUEST', 'content 必填')
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT) return err(res, 413, 'CONTENT_TOO_LARGE', '内容超出 1MB')
    const existing = db.prepare('SELECT * FROM files WHERE id = ?').get(+req.params.id)
    if (!existing) return err(res, 404, 'NOT_FOUND', '文件不存在')
    db.prepare('UPDATE files SET content = ?, mime_type = ?, size_bytes = ?, updated_at = datetime("now") WHERE id = ?')
      .run(content, mimeType || existing.mime_type, Buffer.byteLength(content, 'utf8'), +req.params.id)
    const row = db.prepare('SELECT id, filename, mime_type as mimeType, size_bytes as sizeBytes, updated_at as updatedAt FROM files WHERE id = ?').get(+req.params.id)
    json(res, 200, row)
  },

  'DELETE /api/files/:id': async (req, res) => {
    const auth = await getAuth(req)
    if (!auth) return err(res, 401, 'UNAUTHENTICATED', '请先登录')
    db.prepare('DELETE FROM files WHERE id = ?').run(+req.params.id)
    res.writeHead(204); res.end()
  },

  'GET /u/:filename': async (req, res) => {
    const row = db.prepare('SELECT filename, content, mime_type FROM files WHERE filename = ?').get(req.params.filename)
    if (!row) { res.writeHead(404); return res.end('Not found') }
    res.writeHead(200, {
      'Content-Type': row.mime_type || 'text/plain; charset=utf-8',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.filename)}"`,
      'Cache-Control': 'public, max-age=60',
    })
    res.end(row.content)
  },
}

// --- 派发 ---
const matchRoute = (method, path) => {
  for (const [k, handler] of Object.entries(routes)) {
    const [m, p] = k.split(' ')
    if (m !== method) continue
    if (p.includes(':')) {
      const parts = p.split('/'); const pp = path.split('/')
      if (parts.length !== pp.length) continue
      const params = {}
      let ok = true
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(pp[i])
        else if (parts[i] !== pp[i]) { ok = false; break }
      }
      if (ok) return { handler, params }
    } else if (p === path) {
      return { handler, params: {} }
    }
  }
  return null
}

// --- 静态文件 ---
const serveStatic = async (req, res, path) => {
  try {
    let filePath = join(STATIC_DIR, path === '/' ? '/index.html' : path)
    let st
    try { st = await stat(filePath) } catch { filePath = join(STATIC_DIR, 'index.html'); st = await stat(filePath) }
    if (st.isDirectory()) filePath = join(filePath, 'index.html')
    const data = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': sniffMime(filePath), 'Cache-Control': 'public, max-age=300' })
    res.end(data)
  } catch { res.writeHead(404); res.end('Not found') }
}

// --- 入口限流（内存版）---
const limitBuckets = new Map()
const limit = (key, max, windowMs) => {
  const now = Date.now()
  const b = limitBuckets.get(key) || { count: 0, resetAt: now + windowMs }
  if (now > b.resetAt) { b.count = 0; b.resetAt = now + windowMs }
  b.count++
  limitBuckets.set(key, b)
  return b.count <= max
}

// --- server ---
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x')
    const m = matchRoute(req.method, url.pathname)
    if (m) {
      req.params = m.params
      // 限流：登录/setup 每 IP 每分钟 5 次
      if (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/setup') {
        const ip = req.socket.remoteAddress
        if (!limit(`auth:${ip}`, 5, 60000)) return err(res, 429, 'RATE_LIMITED', '请求过于频繁')
      }
      return await m.handler(req, res)
    }
    if (req.method === 'GET') return await serveStatic(req, res, url.pathname)
    res.writeHead(404); res.end('Not found')
  } catch (e) {
    console.error(e)
    json(res, 500, { error: { code: 'INTERNAL', message: '服务器开小差' } })
  }
})

server.listen(PORT, () => console.log(`TopFiles server on :${PORT}`))
```

> 上面约 150-180 行。**真实工程里还会拆几个文件**（db、auth、files、share、utils），但逻辑就这些。

---

## 9. 部署

### 9.1 直接跑

```bash
# 服务器
git clone <repo>
cd topfiles/server
npm ci

# 前端构建
cd ../  # 项目根
npm ci
npm run build      # 产物在 dist/

# 起服务
cd server
JWT_SECRET=$(openssl rand -hex 32) \
COOKIE_SECURE=true \
STATIC_DIR=../dist \
PORT=3000 \
node server.js
```

### 9.2 systemd 服务

```ini
# /etc/systemd/system/topfiles.service
[Unit]
Description=TopFiles
After=network.target

[Service]
Type=simple
User=topfiles
WorkingDirectory=/opt/topfiles/server
EnvironmentFile=/opt/topfiles/server/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now topfiles
```

### 9.3 反向代理

```nginx
server {
  listen 443 ssl http2;
  server_name app.example.com;
  
  ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
  
  client_max_body_size 2m;
  
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

### 9.4 备份

```bash
# 加 cron：每天凌晨 3 点备份
0 3 * * * cp /opt/topfiles/data.db /opt/topfiles/backups/data-$(date +\%Y\%m\%d).db && find /opt/topfiles/backups -mtime +30 -delete
```

### 9.5 部署 checklist

- [ ] 域名 + DNS
- [ ] HTTPS 证书
- [ ] `.env` 700 权限
- [ ] 防火墙只开 80/443
- [ ] 数据目录持久
- [ ] 备份恢复演练

---

## 10. 错误处理与测试

### 10.1 错误码

| HTTP | Code | 触发 | 提示 |
|---|---|---|---|
| 400 | `INVALID_REQUEST` | 参数缺失/格式错 | 请求格式有误 |
| 400 | `INVALID_USERNAME` | 用户名格式错 | 用户名格式：3-32 位，字母数字 _ - |
| 400 | `WEAK_PASSWORD` | 密码 < 8 位 | 密码至少 8 位 |
| 401 | `UNAUTHENTICATED` | 未登录 | 请先登录 |
| 401 | `INVALID_CREDENTIALS` | 用户名/密码错 | 用户名或密码错误 |
| 404 | `NOT_FOUND` | 文件不存在 | 文件不存在 |
| 409 | `ALREADY_INITIALIZED` | 已注册过 | 系统已存在账号 |
| 409 | `FILENAME_CONFLICT` | 同名文件 | 同名文件已存在 |
| 413 | `CONTENT_TOO_LARGE` | > 1MB | 内容超出 1MB 限制 |
| 429 | `RATE_LIMITED` | 限流 | 请求过于频繁 |
| 500 | `INTERNAL` | 未预期 | 服务器开小差 |

### 10.2 测试三层

**1. 单元（Vitest）**：
- filename 规范化（小写、非法字符、Unicode）
- bcrypt hash/compare
- JWT sign/verify
- 限流逻辑
- mime 推断

**2. 集成（Vitest + 真实 SQLite）**：
- 注册 → 登录 → 创建文件 → 分享 → 公开访问完整流程
- 重复注册返回 409
- 错误码各分支（400/401/404/409/413/429）
- 单账号 CHECK 约束
- 同名文件冲突

**3. 端到端（Playwright）**：
- 首次访问 → 创建账号 → 创建文件 → 分享 → 复制直链 → 退出登录 → 隐身窗打开直链

**4. 手动 smoke**：
- [ ] 首次访问看到"创建账号"
- [ ] 注册后跳到主界面
- [ ] 注销后看到"登录"
- [ ] 第二次访问（已注册）直接看到"登录"
- [ ] 输错密码 → 401
- [ ] 创建文件 → 侧边栏出现
- [ ] 编辑 → 刷新内容还在
- [ ] 分享 → 复制直链
- [ ] 隐身窗打开直链 → 看到内容
- [ ] 输错直链文件名 → 404
- [ ] 同名文件创建 → 409
- [ ] 超过 1MB 内容 → 413

---

## 11. 目录结构

```
TopFiles/
├── src/                          # 前端
│   ├── api/client.ts
│   ├── stores/
│   │   ├── auth.ts
│   │   └── files.ts
│   ├── views/
│   │   ├── SetupView.vue
│   │   ├── LoginView.vue
│   │   └── MainView.vue
│   ├── components/
│   │   ├── ShareDialog.vue
│   │   ├── CopyableInput.vue
│   │   ├── Sidebar.vue
│   │   ├── TopBar.vue
│   │   └── ...（现有）
│   ├── App.vue                   # 改造：只做三选一
│   └── ...
├── server/                       # 后端
│   ├── server.js                 # 主入口（~150 行）
│   ├── package.json
│   ├── .env.example
│   ├── data.db                   # SQLite（gitignore）
│   ├── data/                     # 备份目录
│   └── test/
├── web/e2e/                      # Playwright
├── docs/superpowers/specs/2026-07-08-topfiles-share-design.md
├── package.json
└── ...
```

---

## 12. 未来扩展（out of scope for MVP）

- 多用户
- 二进制文件
- 文件夹
- 文件搜索/分页
- GitHub 同步
- 实时协作
- refresh token
- 文件 visibility

---

## 13. 待定项

开发时间 / 实施优先级待与产品决策后确定。
