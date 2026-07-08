# TopFiles 分享功能 — 设计文档

**日期**：2026-07-08
**状态**：设计稿（待实施）
**作者**：与 Claude 协作完成

---

## 1. 背景与目标

### 1.1 项目现状

`TopFiles` 是一个基于 Vue 3 + Vite + TypeScript + CodeMirror 6 的纯前端在线文件编辑工具。用户输入文件名、编辑内容、点击下载到本地。

**当前限制**：
- 无后端，所有内容只在浏览器里
- 无账号、无云存储
- "分享"只能下载到本地后再用其他工具发出去

### 1.2 目标

为 TopFiles 增加"在线分享"能力，让用户能够：

- 用 GitHub 账号登录
- 把编辑的文件保存到云端
- 生成一个**可读的公开直链**（类似 GitHub 文件 URL 风格：`/u/<username>/<filename>`）
- 通过直链把文件分享给任何人
- 在个人 Dashboard 管理自己所有文件

### 1.3 范围

**MVP 范围（in）**：
- GitHub OAuth 登录
- 文本与二进制文件上传/编辑/删除
- 可读直链（默认只读）
- 个人 Dashboard
- Docker Compose 一键部署

**MVP 不做（out）**：
- 实时协作编辑
- 文件夹/层级目录
- 评论、点赞
- 付费/会员
- 自定义域名
- 移动 App

---

## 2. 关键决策摘要

| 维度 | 决策 | 理由 |
|---|---|---|
| 权限模型 | 完整用户系统 | 便于管理自己的文件、撤销分享、统计 |
| 直链权限 | 默认只读（公开桶模式） | 实现简单、无需并发控制 |
| 直链格式 | `https://app/u/<username>/<filename>` | 可读、SEO 友好、品牌感强 |
| 技术栈 | Node.js + Fastify + TypeScript | 复用现有 TS 技术栈 |
| ORM | Drizzle | TypeScript 优先、类型安全、迁移生成器好 |
| 数据库 | SQLite（生产用 WAL 模式） | 零运维、单文件易备份、对小项目足够 |
| 对象存储 | S3 兼容（本地 MinIO，生产可换 R2/OSS） | 协议统一、切换无感、扩展灵活 |
| 认证方式 | GitHub OAuth | 免邮件问题、目标用户都是开发者 |
| Token 机制 | JWT (access) + DB 存 refresh | access 无状态、refresh 可吊销 |

---

## 3. 架构总览

```
┌──────────────────────────────────────────────┐
│            浏览器 (Vue 3 前端)               │
│  - 现有 TopFiles 编辑器                       │
│  - 新增：登录、文件列表、分享管理            │
└────────────────┬─────────────────────────────┘
                 │ HTTPS
                 ▼
┌──────────────────────────────────────────────┐
│         Fastify API (Node.js)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Auth    │  │  Files   │  │  Share   │   │
│  │  (OAuth) │  │  (CRUD)  │  │  (直链)  │   │
│  └──────────┘  └──────────┘  └──────────┘   │
└──────┬───────────────────────┬──────────────┘
       │                       │
       ▼                       ▼
┌──────────────┐        ┌─────────────────┐
│  SQLite      │        │  S3 兼容存储    │
│  (元数据)    │        │  本地: MinIO    │
│              │        │  生产: R2/OSS   │
└──────────────┘        └─────────────────┘
```

### 3.1 核心流程

1. **登录**：用户点"用 GitHub 登录" → 跳转 GitHub → 回调后服务端发 JWT → 写入 httpOnly cookie
2. **保存**：已登录用户编辑文件 → `PUT /api/files/:id` → 内容走 S3，元数据走 SQLite
3. **分享**：用户在文件列表点"分享" → `PATCH /api/files/:id/visibility` 改为 `public` → 返回直链 URL
4. **直链访问**：任何人访问 `/u/<username>/<filename>` → 服务端校验 visibility → 返回 S3 流或 302 签名 URL

### 3.2 S3 适配层

封装 `StorageAdapter` 接口（`put / get / getMetadata / delete / getSignedUrl`），提供两个实现：

- `MinioAdapter`：本地开发
- `R2Adapter` / `OssAdapter`：生产

业务代码通过工厂注入 `createStorage(env)`，对调用方透明。

---

## 4. 数据模型（SQLite）

### 4.1 表结构

```sql
-- 1. 用户表
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id     INTEGER UNIQUE NOT NULL,
  username      TEXT UNIQUE NOT NULL COLLATE NOCASE,
  display_name  TEXT,
  avatar_url    TEXT,
  email         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_username ON users(username COLLATE NOCASE);

-- 2. 文件表
CREATE TABLE files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL COLLATE NOCASE,
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  storage_key  TEXT NOT NULL,
  visibility   TEXT NOT NULL DEFAULT 'private'
                 CHECK (visibility IN ('public', 'private')),
  etag         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, filename COLLATE NOCASE)
);
CREATE INDEX idx_files_user_visibility ON files(user_id, visibility);

-- 3. 会话表（refresh token）
CREATE TABLE sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT UNIQUE NOT NULL,
  user_agent    TEXT,
  ip            TEXT,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- 4. 访问日志（可选，默认不写）
CREATE TABLE share_access_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id     INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  ip          TEXT,
  user_agent  TEXT,
  accessed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_access_logs_file ON share_access_logs(file_id, accessed_at DESC);
```

### 4.2 关键设计点

| 点 | 理由 |
|---|---|
| `users.github_id` 用 `INTEGER UNIQUE` | GitHub 用户 ID 是数字，比 username 稳定（用户名可改） |
| `users.username` 用 `COLLATE NOCASE` | URL 路径统一小写；查询时大小写不敏感 |
| `files.filename` 用 `COLLATE NOCASE` 唯一约束 | `Notes.md` 和 `notes.md` 视为同一文件 |
| `files.storage_key` 与 `filename` 解耦 | 重命名只改 metadata，S3 物理对象可加 user_id 前缀保留 |
| `files.etag` 存内容 SHA-256 | 304 缓存、S3 上传校验、并发控制都用得上 |
| `share_access_logs` 默认不写 | MVP 不开，按需启用，避免数据爆炸 |
| `ON DELETE CASCADE` | 用户注销时自动清理（实际删除前需再确认） |
| `WAL 模式` | 读写并发性能更好（`PRAGMA journal_mode=WAL;`） |

### 4.3 Drizzle schema 示意

```typescript
// server/src/db/schema.ts
import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  githubId: integer('github_id').notNull().unique(),
  username: text('username').notNull().unique().collate('nocase'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  email: text('email'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  usernameIdx: index('idx_users_username').on(t.username),
}))

export const files = sqliteTable('files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull().collate('nocase'),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  storageKey: text('storage_key').notNull(),
  visibility: text('visibility', { enum: ['public', 'private'] }).notNull().default('private'),
  etag: text('etag').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  userFilenameUnique: uniqueIndex('uniq_user_filename').on(t.userId, t.filename),
  userVisibilityIdx: index('idx_files_user_visibility').on(t.userId, t.visibility),
}))

export const sessions = sqliteTable('sessions', { /* ... */ })
export const shareAccessLogs = sqliteTable('share_access_logs', { /* ... */ })
```

---

## 5. API 设计

RESTful 风格，统一返回 JSON。鉴权用 httpOnly cookie。

### 5.1 鉴权

```
GET   /api/auth/github           跳转到 GitHub OAuth 授权页
GET   /api/auth/github/callback  GitHub 回调：换 token、建用户、种 cookie
POST  /api/auth/refresh          用 refresh token 换新的 access token
POST  /api/auth/logout           注销（清 cookie + 删 session）
GET   /api/auth/me               获取当前登录用户信息
```

### 5.2 文件 CRUD（全部需登录）

```
GET    /api/files                       列出我的所有文件
                                        ?visibility=public&search=foo&page=1&limit=50

POST   /api/files                       创建文件
        body: { filename, content|binary, mimeType? }
        ≤ 1MB 走 JSON；> 1MB 走 multipart

GET    /api/files/:id                   获取文件详情 + 内容（小文件直接返）
                                        响应头 ETag 用于客户端缓存

PUT    /api/files/:id                   更新文件
        body: { content, mimeType? }
        校验 If-Match ETag（乐观锁）

DELETE /api/files/:id                   删除文件（同时删 S3 对象）

PATCH  /api/files/:id                   修改元数据
        body: { filename?, visibility? }
        filename 改了要处理 301 重定向
```

### 5.3 分享

```
PATCH  /api/files/:id/visibility         切换 public/private
GET    /api/files/:id/share-info         获取分享元信息（直链、创建时间、访问次数）
```

### 5.4 公开访问（无需登录）

```
GET    /u/:username/:filename            直链入口
                                        ├─ 304 if-none-match
                                        ├─ 私密文件 → 404（不暴露存在性）
                                        ├─ 小文件（< 5MB）→ 直接 stream
                                        └─ 大文件 → 302 到 S3 签名 URL（10 分钟有效）

GET    /u/:username                      个人主页（列出所有 public 文件）
```

### 5.5 通用约定

| 项 | 规则 |
|---|---|
| 请求体 | JSON（除 multipart 外） |
| 鉴权 | httpOnly cookie `tf_access`（JWT 15min）+ `tf_refresh`（30 天） |
| 错误格式 | `{ error: { code, message, details? } }` |
| 状态码 | 200/201/204 成功；400 参数；401 未登录；403 权限；404 不存在；409 冲突；413 超大；429 限流；5xx 服务端 |
| 限流 | 每用户每分钟 60 写/600 读；直链每 IP 每分钟 300 |
| 分页 | `?page=1&limit=50`，响应带 `total`、`hasMore` |
| 字符集 | UTF-8，路径段先 `encodeURIComponent` |

---

## 6. 鉴权流程（GitHub OAuth）

### 6.1 完整流程

```
浏览器                我们的 API              GitHub
  │                    │                      │
  │ 1. 点"用 GitHub 登录"                      │
  ├───────────────────>│                      │
  │ 2. 302 → /api/auth/github                  │
  │<───────────────────┤                      │
  │ 3. 302 → GitHub 授权页                     │
  │<──────────────────────────────────────────>│
  │ 4. 用户点"Authorize"                        │
  │<──────────────────────────────────────────>│
  │ 5. 回调：GET /api/auth/github/callback?code=xxx
  ├───────────────────>│                      │
  │                    │ 6. 用 code 换 token   │
  │                    ├─────────────────────>│
  │                    │ 7. 拉用户信息         │
  │                    ├─────────────────────>│
  │                    │ 8. upsert 用户        │
  │                    │ 9. 签 JWT + 种 cookie │
  │ 10. 302 → 前端首页                          │
  │<───────────────────┤                      │
```

### 6.2 Cookie 设计

```
tf_access   JWT access token，15 分钟
            httpOnly, secure, sameSite=Lax, path=/

tf_refresh  随机 32 字节 base64
            httpOnly, secure, sameSite=Lax, path=/api/auth
            30 天有效，存 sessions 表
```

- access token 用 JWT（HS256 + 强密钥）— 自验证，无需查 DB
- refresh token 存 DB — 可主动吊销

### 6.3 JWT payload

```json
{
  "sub": "user:42",
  "gh_id": 12345678,
  "username": "liubleed",
  "iat": 1717800000,
  "exp": 1717800900
}
```

### 6.4 关键路由伪代码

```typescript
// GET /api/auth/github
fastify.get('/api/auth/github', async (req, reply) => {
  const state = nanoid()
  reply.setCookie('tf_oauth_state', state, { httpOnly: true, sameSite: 'Lax' })
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', env.GITHUB_CLIENT_ID)
  url.searchParams.set('redirect_uri', env.GITHUB_CALLBACK_URL)
  url.searchParams.set('scope', 'read:user user:email')
  url.searchParams.set('state', state)
  return reply.redirect(url.toString())
})

// GET /api/auth/github/callback
fastify.get('/api/auth/github/callback', async (req, reply) => {
  const { code, state } = req.query
  if (state !== req.cookies.tf_oauth_state) throw new AppError(400, 'STATE_MISMATCH', 'OAuth state 校验失败')
  
  const { access_token } = await exchangeCodeForToken(code)
  const ghUser = await fetchGitHubUser(access_token)
  const user = await upsertUser(ghUser)
  
  const accessToken = await reply.jwtSign({ sub: `user:${user.id}`, gh_id: user.githubId, username: user.username })
  const refreshToken = nanoid(32)
  await db.insert(sessions).values({ userId: user.id, refreshToken, expiresAt: addDays(30) })
  
  reply.setCookie('tf_access', accessToken, { maxAge: 900, httpOnly: true, secure: true, sameSite: 'Lax' })
  reply.setCookie('tf_refresh', refreshToken, { maxAge: 30*24*3600, httpOnly: true, secure: true, sameSite: 'Lax', path: '/api/auth' })
  reply.clearCookie('tf_oauth_state')
  return reply.redirect(env.FRONTEND_URL)
})

// POST /api/auth/refresh
fastify.post('/api/auth/refresh', async (req, reply) => {
  const refreshToken = req.cookies.tf_refresh
  if (!refreshToken) throw new AppError(401, 'UNAUTHENTICATED', '请先登录')
  
  const session = await db.query.sessions.findFirst({ where: eq(sessions.refreshToken, refreshToken) })
  if (!session || new Date(session.expiresAt) < new Date()) {
    throw new AppError(401, 'TOKEN_EXPIRED', '登录已过期')
  }
  
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) })
  const newAccessToken = await reply.jwtSign({ sub: `user:${user.id}`, gh_id: user.githubId, username: user.username })
  reply.setCookie('tf_access', newAccessToken, { maxAge: 900, httpOnly: true, secure: true, sameSite: 'Lax' })
  return { ok: true }
})
```

### 6.5 安全清单

- [x] state 参数防 CSRF
- [x] JWT HS256 + 强密钥（32 字节随机）
- [x] cookie 全 `httpOnly + secure + sameSite=Lax`
- [x] refresh token 存 DB 可吊销
- [x] GitHub access_token 不存（用完即丢）
- [x] 错误不泄露内部细节
- [x] 限流：登录/刷新每 IP 每分钟 10 次

### 6.6 必需环境变量

```bash
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_CALLBACK_URL=https://app.example.com/api/auth/github/callback
JWT_SECRET=<32 字节随机>
FRONTEND_URL=https://app.example.com
```

---

## 7. 文件存储层

### 7.1 抽象接口

```typescript
// server/src/storage/adapter.ts
export interface StorageAdapter {
  put(key: string, body: Buffer | NodeJS.ReadableStream, contentType: string)
    : Promise<{ etag: string; size: number }>
  get(key: string): Promise<NodeJS.ReadableStream>
  getMetadata(key: string): Promise<{ etag: string; size: number; contentType: string }>
  delete(key: string): Promise<void>
  getSignedUrl(key: string, expiresInSec: number): Promise<string>
}
```

### 7.2 实现

```typescript
// server/src/storage/minio.ts
// server/src/storage/r2.ts
// server/src/storage/oss.ts
// 工厂：createStorage(env) 根据 STORAGE_BACKEND 选择
```

### 7.3 S3 Key 设计

```
users/{user_id}/{yyyy}/{mm}/{file_id}-{filename}
```

例：`users/42/2026/07/1234-notes.md`

| 好处 | 体现 |
|---|---|
| 用户隔离 | 物理分目录，将来加配额只需统计 `users/{id}/` 下对象 |
| 时间分片 | 同一用户文件多了不卡单目录 |
| file_id 前缀 | 物理文件名永不冲突，DB 改名/删旧版本不影响 S3 |

### 7.4 上传路径

**小文件（≤ 1MB）**：
```
PUT /api/files
Content-Type: application/json
{filename, content, mimeType?}
  └─ 转 Buffer → storage.put() → 写 DB → 201 + 返回文件详情
```

**大文件（> 1MB，前端直传 S3）**：
```
1. POST /api/files (声明要创建的文件)
   服务端：预签 S3 multipart URLs → 返回 { uploadId, partUrls[] }
2. 客户端：直接 PUT 到 S3（每个 part 一个 URL）
3. 客户端：POST /api/files/:id/complete { parts: [...] }
   服务端：S3.CompleteMultipartUpload → 写 DB
```

**孤儿清理**：客户端 5 分钟不上传 complete，服务端定时 job 调 `AbortMultipartUpload`。

### 7.5 下载路径

```
GET /u/:username/:filename
  ├─ 查 DB 拿 storage_key + size
  ├─ size < 5MB：storage.get() → stream 给客户端（可 304 缓存、统计、鉴权）
  ├─ size ≥ 5MB：reply.redirect(302, storage.getSignedUrl(key, 600))
  └─ 任何错误 → 404
```

### 7.6 限制

```bash
MAX_FILE_SIZE_MB=100       # 默认
MAX_TEXT_INLINE_MB=1       # 走 JSON body 上限
```

### 7.7 Mime 推断

不信任前端 mime，服务端嗅探：

```typescript
import { fileTypeFromBuffer } from 'file-type'

// 1. 文本扩展名 → text/* | application/json
// 2. magic bytes 嗅探 → 图片/pdf/zip
// 3. fallback → application/octet-stream
```

下载时 `Content-Disposition: inline; filename="<encoded>"` 决定预览或下载。

### 7.8 配额（可选，MVP 不强制）

```typescript
// 每用户限额（环境变量）
USER_MAX_TOTAL_BYTES=1073741824   // 1 GB
USER_MAX_FILE_COUNT=1000
```

创建/上传前检查，超额 → 413 + 友好提示。

---

## 8. 前端改造

### 8.1 路由

```typescript
// src/router/index.ts
const routes = [
  { path: '/', component: HomeView },                    // 匿名：编辑器 + 草稿
  { path: '/login', component: LoginView },
  { path: '/u/:username', component: UserProfileView },
  { path: '/u/:username/:filename', component: PublicFileView },
  { path: '/dashboard', component: DashboardView, meta: { requiresAuth: true } },
  { path: '/dashboard/files/:id', component: EditView, meta: { requiresAuth: true } },
]
```

### 8.2 新增视图

| 视图 | 作用 |
|---|---|
| `LoginView.vue` | "用 GitHub 登录"大按钮 |
| `DashboardView.vue` | 我的文件列表 + 新建 + 搜索/筛选 |
| `EditView.vue` | 改造现有 App.vue — 加"保存到云"和"分享"按钮 |
| `UserProfileView.vue` | 某用户所有 public 文件 |
| `PublicFileView.vue` | 直链落地页：预览 + 下载 |

### 8.3 改造后的工具栏

```vue
<TopBar>
  <input v-model="filename" />
  <select v-model="suffix">…</select>
  
  <button @click="saveDraft" v-if="!isLoggedIn">保存草稿</button>
  <button @click="saveToCloud" v-if="isLoggedIn">保存到云</button>
  <button @click="openShareDialog" v-if="isLoggedIn">分享</button>
  <button @click="downloadFile">下载</button>
  
  <UserMenu v-if="isLoggedIn" />
  <LoginButton v-else />
</TopBar>
```

### 8.4 状态管理

```typescript
// src/stores/auth.ts
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const isLoggedIn = computed(() => !!user.value)
  
  async function fetchMe() {
    user.value = await api.get('/api/auth/me').catch(() => null)
  }
  function logout() { return api.post('/api/auth/logout').then(() => user.value = null) }
  
  return { user, isLoggedIn, fetchMe, logout }
})

// src/stores/files.ts
export const useFilesStore = defineStore('files', () => {
  const list = ref<FileMeta[]>([])
  async function fetchList(params) { list.value = await api.get('/api/files', { params }) }
  async function createFile(payload) { ... }
  async function updateFile(id, payload) { ... }
  async function deleteFile(id) { ... }
  async function toggleVisibility(id, visibility) { ... }
  
  return { list, fetchList, createFile, updateFile, deleteFile, toggleVisibility }
})
```

### 8.5 API 客户端

```typescript
// src/api/client.ts
import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
})

// 自动 refresh
api.interceptors.response.use(null, async (err) => {
  if (err.response?.status === 401 && !err.config._retried) {
    err.config._retried = true
    await api.post('/api/auth/refresh')
    return api(err.config)
  }
  return Promise.reject(err)
})
```

### 8.6 分享弹窗

```vue
<Modal v-model:open="open">
  <h2>分享文件</h2>
  
  <div v-if="file.visibility === 'public'">
    <CopyableInput :value="shareUrl" />
    <p>访问次数：{{ file.viewCount }}</p>
  </div>
  
  <div v-else>
    <p>此文件目前为私密。</p>
    <button @click="enableShare">生成公开链接</button>
  </div>
  
  <button @click="disableShare" v-if="file.visibility === 'public'">
    取消公开访问
  </button>
</Modal>
```

### 8.7 与现有草稿模式兼容

```
未登录用户                              登录用户
─────────                              ───────
新建 → 编辑 → 下载                       新建 → 编辑 → "保存到云" → 进 dashboard
      ↓                                       ↓
localStorage 草稿                          文件入库
      ↓                                       ↓
下次打开自动恢复                          "分享" → 生成直链
```

现有用户（不想注册）完全不受影响。

### 8.8 Dashboard UI

```
┌─────────────────────────────────────────────────────┐
│  我的文件                              [+ 新建]      │
│  [搜索…] [全部 ▾] [公开 ▾] [最新修改 ▾]            │
├─────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ 📄 notes.md  │  │ 📄 config.yml│  │ 🖼️ a.png │ │
│  │ 2.3 KB       │  │ 891 B        │  │ 1.2 MB   │ │
│  │ 公开 · 2天前 │  │ 私密 · 1周前 │  │ 公开     │ │
│  │ [编辑][分享] │  │ [编辑][分享] │  │ [编辑]   │ │
│  └──────────────┘  └──────────────┘  └──────────┘ │
└─────────────────────────────────────────────────────┘
```

支持：搜索、筛选 visibility、排序、分页、批量删除。

---

## 9. 部署

### 9.1 Docker Compose

```yaml
# docker-compose.yml
version: '3.9'

services:
  api:
    build: ./server
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: file:/data/topfiles.db
      STORAGE_BACKEND: minio
      S3_ENDPOINT: http://minio:9000
      S3_BUCKET: topfiles
      S3_ACCESS_KEY: ${S3_ACCESS_KEY}
      S3_SECRET_KEY: ${S3_SECRET_KEY}
      GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID}
      GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET}
      GITHUB_CALLBACK_URL: ${GITHUB_CALLBACK_URL}
      JWT_SECRET: ${JWT_SECRET}
      FRONTEND_URL: ${FRONTEND_URL}
    volumes:
      - ./data:/data
    depends_on:
      - minio

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data/minio --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY}
    volumes:
      - ./data/minio:/data/minio
    # 不对外暴露端口 — 仅 api 内部访问

  web:
    build: ./web
    restart: unless-stopped
    ports:
      - "8080:80"

  backup:
    image: alpine
    volumes:
      - ./data:/data:ro
      - ./backups:/backups
    entrypoint: |
      sh -c 'while true; do
        ts=$$(date +%Y%m%d-%H%M%S)
        sqlite3 /data/topfiles.db ".backup /backups/db-$$ts.db"
        tar czf /backups/minio-$$ts.tar.gz -C /data/minio .
        find /backups -mtime +7 -delete
        sleep 86400
      done'
```

### 9.2 反向代理（Nginx）

```nginx
server {
  listen 443 ssl http2;
  server_name app.example.com;
  
  ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
  
  location / {
    root /var/www/topfiles/web;
    try_files $uri $uri/ /index.html;
  }
  
  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    client_max_body_size 110m;
  }
  
  location /u/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

### 9.3 启动顺序

```bash
# 1. 启动 minio，建 bucket
docker compose up -d minio
sleep 5
docker compose exec minio mc alias set local http://localhost:9000 $S3_ACCESS_KEY $S3_SECRET_KEY
docker compose exec minio mc mb local/topfiles
docker compose exec minio mc anonymous set none local/topfiles

# 2. 启动 api
docker compose up -d api

# 3. 启动 web
docker compose up -d web

# 4. 启动备份
docker compose up -d backup
```

### 9.4 本地开发

```bash
# 一键起全套
docker compose -f docker-compose.dev.yml up

# 或分别起（体验更好）
cd server && npm run dev       # fastify 热重载
cd web && npm run dev          # vite 热重载
docker run -d -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address :9001
```

### 9.5 升级到生产存储（MinIO → R2/OSS）

1. 新建 bucket、拿 access key
2. 改环境变量：`STORAGE_BACKEND=r2`，填 `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`
3. 数据迁移：`rclone sync minio:bucket r2:bucket`（业务 0 停机）
4. 下线 MinIO 容器

### 9.6 部署 checklist

- [ ] 域名 + DNS 解析
- [ ] HTTPS 证书（Let's Encrypt）
- [ ] 服务器最低配置：1 vCPU / 1 GB RAM
- [ ] `.env` 文件 700 权限
- [ ] MinIO 控制台端口 (9001) 不对外
- [ ] 防火墙只开 80/443
- [ ] 备份跑通后做一次恢复演练

---

## 10. 错误处理与测试

### 10.1 统一错误类型

```typescript
// server/src/errors.ts
class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) { super(message) }
}
```

### 10.2 错误响应格式

```json
{ "error": { "code": "FILE_NOT_FOUND", "message": "文件不存在" } }
```

### 10.3 错误码清单

| HTTP | Code | 触发 | 用户提示 |
|---|---|---|---|
| 400 | `INVALID_REQUEST` | 参数缺失/格式错 | 请求格式有误 |
| 400 | `INVALID_FILENAME` | 包含非法字符 | 文件名只能包含字母数字和 . _ - |
| 401 | `UNAUTHENTICATED` | 未登录 | 请先登录 |
| 401 | `TOKEN_EXPIRED` | refresh 后仍失败 | 登录已过期 |
| 403 | `NOT_OWNER` | 操作别人的文件 | 无权操作此文件 |
| 404 | `FILE_NOT_FOUND` | 文件不存在/无权 | 文件不存在 |
| 404 | `USER_NOT_FOUND` | 用户不存在 | 用户不存在 |
| 409 | `FILENAME_CONFLICT` | 同名已存在 | 同名文件已存在 |
| 409 | `ETAG_MISMATCH` | 并发覆盖 | 文件已被修改，请刷新后重试 |
| 413 | `FILE_TOO_LARGE` | 超大小 | 文件超出 100MB 限制 |
| 413 | `QUOTA_EXCEEDED` | 配额满 | 存储空间已满 |
| 429 | `RATE_LIMITED` | 触发限流 | 请求过于频繁 |
| 500 | `INTERNAL` | 未捕获 | 服务器开小差 |
| 503 | `STORAGE_UNAVAILABLE` | S3 挂了 | 存储服务暂不可用 |

### 10.4 全局错误处理

```typescript
fastify.setErrorHandler((err, req, reply) => {
  if (err instanceof AppError) {
    return reply.status(err.statusCode).send({
      error: { code: err.code, message: err.message, details: err.details }
    })
  }
  if (err.validation) {
    return reply.status(400).send({
      error: { code: 'INVALID_REQUEST', message: '请求参数不合法', details: err.validation }
    })
  }
  logger.error({ err, path: req.url, method: req.method }, 'unhandled error')
  Sentry.captureException(err)
  return reply.status(500).send({
    error: { code: 'INTERNAL', message: '服务器开小差了' }
  })
})
```

### 10.5 并发控制（ETag 乐观锁）

```typescript
// PUT /api/files/:id
// header: If-Match: "<old-etag>"
const file = await db.getFile(id)
if (file.etag !== oldEtag) {
  throw new AppError(409, 'ETAG_MISMATCH', '文件已被修改')
}
// 计算新 etag → put S3 → update DB
```

### 10.6 限流

```typescript
import rateLimit from '@fastify/rate-limit'

await fastify.register(rateLimit, { global: false })

fastify.post('/api/files', {
  config: { rateLimit: { max: 60, timeWindow: '1 minute', keyGenerator: req => req.user.id } }
}, handler)

fastify.get('/u/:username/:filename', {
  config: { rateLimit: { max: 300, timeWindow: '1 minute', keyGenerator: req => req.ip } }
}, handler)
```

### 10.7 测试三层

**1. 单元测试（Vitest）**：
- filename 规范化
- etag 计算
- share URL 生成
- quota 计算

**2. 集成测试（Vitest + 真实 SQLite + 真实 MinIO）**：
- 文件创建/更新/删除完整流程
- 鉴权各分支（未登录/已登录/过期）
- 错误码 401/403/404/409/413 触发
- ETag 并发冲突
- 直链 304 缓存

**3. 端到端（Playwright）**：
- 登录 → 创建文件 → 分享 → 复制直链 → 退出 → 隐身窗打开直链
- 私密文件直链 → 404
- 大文件 multipart 上传

**4. 手动 smoke test**：
- [ ] 登录看到自己头像
- [ ] 创建文件，dashboard 出现
- [ ] 编辑后刷新内容还在
- [ ] 公开后复制直链，新隐身窗能开
- [ ] 私密后直链 404
- [ ] 注销 cookie 清掉
- [ ] 重新登录还能看到自己文件
- [ ] 上传 >1MB 走 multipart
- [ ] 上传 >100MB 触发 413
- [ ] 改用户名，旧直链 301 到新链接
- [ ] 两个浏览器同时编辑 → 一个收到 409

### 10.8 监控

- **Sentry**（免费版）：5xx + 前端 JS 错误
- **结构化日志**（pino）：写 stdout，`docker logs` 即可看
- **健康检查**：`GET /api/health` → `{ status: 'ok', db: 'ok', storage: 'ok' }`
- **MVP 不引入** Grafana / Prometheus / ELK

---

## 11. 目录结构（最终）

```
TopFiles/
├── src/                          # 前端（现有）
│   ├── api/client.ts
│   ├── stores/auth.ts
│   ├── stores/files.ts
│   ├── router/index.ts
│   ├── views/
│   │   ├── HomeView.vue
│   │   ├── LoginView.vue
│   │   ├── DashboardView.vue
│   │   ├── EditView.vue          # 改造自 App.vue
│   │   ├── UserProfileView.vue
│   │   └── PublicFileView.vue
│   ├── components/
│   │   ├── ShareDialog.vue
│   │   ├── UserMenu.vue
│   │   ├── LoginButton.vue
│   │   ├── CopyableInput.vue
│   │   └── ...
│   └── ...
├── server/                       # 后端（新）
│   ├── src/
│   │   ├── server.ts             # fastify 入口
│   │   ├── config/env.ts
│   │   ├── db/
│   │   │   ├── schema.ts         # drizzle schema
│   │   │   ├── client.ts
│   │   │   └── migrations/
│   │   ├── storage/
│   │   │   ├── adapter.ts        # 接口
│   │   │   ├── minio.ts
│   │   │   ├── r2.ts
│   │   │   └── factory.ts
│   │   ├── auth/
│   │   │   ├── github.ts
│   │   │   ├── jwt.ts
│   │   │   └── middleware.ts
│   │   ├── files/
│   │   │   ├── routes.ts
│   │   │   ├── service.ts
│   │   │   └── filename.ts
│   │   ├── share/
│   │   │   └── routes.ts
│   │   ├── errors.ts
│   │   └── plugins/
│   │       ├── ratelimit.ts
│   │       └── sentry.ts
│   ├── test/
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── web/e2e/                      # Playwright
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-07-08-topfiles-share-design.md
├── docker-compose.yml
├── docker-compose.dev.yml
└── ...
```

---

## 12. 未来扩展（out of scope for MVP）

- 实时协作编辑（OT/CRDT）
- 文件夹/层级目录
- 评论、点赞
- 付费/会员
- 自定义域名
- 移动 App
- 多语言扩展
- CDN 加速直链分发
- 转 Postgres（用户量增长时）

---

## 13. 待定项

开发时间 / 优先级排期待与产品决策后确定。
