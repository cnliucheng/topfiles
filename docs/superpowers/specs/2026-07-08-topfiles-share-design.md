# TopFiles 分享功能 — 极简版设计

**日期**：2026-07-08
**状态**：设计稿（待实施）
**作者**：与 Claude 协作完成

---

## 1. 背景与目标

### 1.1 项目现状

`TopFiles` 是一个基于 Vue 3 + Vite + TypeScript + CodeMirror 6 的纯前端在线文件编辑工具。用户输入文件名、编辑内容、点击下载到本地。

**当前限制**：无后端、无账号、无云存储、无分享链接。

### 1.2 目标

为 TopFiles 增加"在线分享"能力：

- 首次访问引导注册一个账号（**全站只允许一个账号**）
- 登录后左侧显示文件列表，右侧显示现有编辑器
- 编辑完点"保存" → 入库
- 点"分享" → 生成可读直链 `https://app/u/<username>/<filename>`
- 直链任何人可访问，纯文本内容直接展示
- 未登录访问首页 → 显示"创建账号"或"登录"页面

### 1.3 范围

**MVP 范围（in）**：
- 首次访问引导注册（单账号）
- 用户名 + 密码登录
- 登录后单页布局：左侧文件列表 + 右侧编辑器
- 创建/编辑/删除/分享文件
- 可读直链 `/u/:username/:filename`
- Docker 单进程部署

**MVP 不做（out）**：
- 多用户注册
- GitHub OAuth / 第三方登录
- 二进制文件（图片/pdf/zip 等）
- 文件夹/层级目录
- 文件搜索/分页/筛选（简单列表即可）
- 实时协作、评论
- 大文件上传（> 1MB 不支持）

---

## 2. 关键决策

| 维度 | 决策 | 理由 |
|---|---|---|
| 账号模式 | 单账号（首次访问引导注册） | 个人项目，无需多用户管理 |
| 认证 | 用户名 + 密码（bcrypt） | 经典方案，无第三方依赖 |
| 文件范围 | 只支持文本，限 1MB | 覆盖笔记/代码/配置 95% 场景 |
| 存储 | 全部 SQLite，**不引入 S3** | 内容直接存 TEXT 字段，部署极简 |
| ORM | Drizzle | TS 优先、类型安全、迁移简单 |
| 后端 | Fastify + TypeScript | 复用现有 TS 技术栈 |
| Token | JWT + httpOnly cookie | 标准方案 |
| 直链格式 | `/u/:username/:filename` | 可读、品牌感、SEO 友好 |
| 部署 | Docker 单进程 | 一个 Node + 一个 .db 文件 |

---

## 3. 架构总览

```
┌──────────────────────────────────────────────┐
│         浏览器 (Vue 3 单页应用)              │
│  ┌──────────────────────────────────────┐   │
│  │ 未登录：注册 / 登录页                │   │
│  │ 登录后：侧边栏 + 编辑器              │   │
│  └──────────────────────────────────────┘   │
└────────────────┬─────────────────────────────┘
                 │ HTTPS (httpOnly cookie)
                 ▼
┌──────────────────────────────────────────────┐
│         Fastify API (单进程)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Auth    │  │  Files   │  │  Share   │   │
│  │ 注册/登录 │  │  CRUD    │  │  公开直链│   │
│  └──────────┘  └──────────┘  └──────────┘   │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  SQLite         │
              │  (全部数据)     │
              └─────────────────┘
```

**没有对象存储，没有 Redis，没有队列。** 一个 Node 进程 + 一个 .db 文件搞定一切。

---

## 4. 数据模型

### 4.1 表结构

```sql
-- 1. 账号表（永远只有 1 行）
CREATE TABLE users (
  id             INTEGER PRIMARY KEY CHECK (id = 1),  -- 强制单账号
  username       TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash  TEXT NOT NULL,                       -- bcrypt
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. 文件表
CREATE TABLE files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  filename     TEXT NOT NULL COLLATE NOCASE,           -- 唯一
  mime_type    TEXT NOT NULL,
  content      TEXT NOT NULL,                          -- 文本内容直接存
  size_bytes   INTEGER NOT NULL,
  visibility   TEXT NOT NULL DEFAULT 'private'
                 CHECK (visibility IN ('public', 'private')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (filename COLLATE NOCASE)
);
CREATE INDEX idx_files_visibility ON files(visibility);

-- 3. 会话表（refresh token，注销时删）
CREATE TABLE sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  refresh_token TEXT UNIQUE NOT NULL,
  user_agent    TEXT,
  ip            TEXT,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

### 4.2 单账号强制

- `users.id` 上加 `CHECK (id = 1)` — 数据库层面阻止插入第二行
- 注册 API 检测 `COUNT(*) > 0` → 返回 409 "已存在账号，请登录"
- 无需复杂的 admin/role 概念

### 4.3 关键设计点

| 点 | 理由 |
|---|---|
| `users.username` COLLATE NOCASE | URL 路径统一小写 |
| `files.filename` COLLATE NOCASE 唯一 | `Notes.md` 和 `notes.md` 视为同一文件 |
| `content` 直接存 TEXT | 文本小，无需对象存储 |
| `size_bytes` 冗余存储 | 列表展示用，省一次 LENGTH() |
| `visibility` 默认 private | 注册后默认全私密，避免误分享 |
| `WAL 模式` | 读写并发（`PRAGMA journal_mode=WAL;`） |

---

## 5. API 设计

### 5.1 系统元信息

```
GET /api/setup/status
  → { hasAccount: boolean }
  未注册过 → 返回 false，前端跳"创建账号"
  已注册 → 返回 true，前端跳"登录"
```

### 5.2 认证（单账号）

```
POST /api/auth/setup
  body: { username, password }
  → 创建账号（仅在 hasAccount=false 时成功，否则 409）
  → 自动登录（种 cookie）
  → 201 { username }

POST /api/auth/login
  body: { username, password }
  → 校验密码
  → 种 cookie
  → 200 { username }

POST /api/auth/logout
  → 清 cookie + 删 sessions
  → 204

POST /api/auth/refresh
  → 用 refresh token 换新 access token
  → 200

GET /api/auth/me
  → 200 { username } or 401
```

### 5.3 文件 CRUD

```
GET    /api/files                 列出所有文件
                                  返回：[{ id, filename, mimeType, sizeBytes, 
                                           visibility, updatedAt }, ...]
                                  按 updated_at DESC 排序

POST   /api/files                 创建
        body: { filename, content, mimeType? }
        → 201 { id, filename, ... }

GET    /api/files/:id             获取详情 + content
        → 200 { id, filename, content, ... }

PUT    /api/files/:id             更新内容
        body: { content, mimeType? }
        → 200 { id, filename, ... }

DELETE /api/files/:id
        → 204

PATCH  /api/files/:id             改 visibility 或 改名
        body: { visibility? , filename? }
        → 200 { id, filename, ... }
```

### 5.4 公开直链

```
GET /u/:username/:filename
  → 查 user → 查 file
  → 私密 → 404（不暴露存在性）
  → 公开 → 200
       header Content-Type: <mime>
       header Content-Disposition: inline; filename="<encoded>"
       body: 文件内容
```

### 5.5 通用约定

| 项 | 规则 |
|---|---|
| 鉴权 | httpOnly cookie `tf_access`（JWT 15min）+ `tf_refresh`（30 天） |
| 错误格式 | `{ error: { code, message } }` |
| 状态码 | 200/201/204 成功；400 参数；401 未登录；404 不存在；409 冲突；5xx 服务端 |
| 字符集 | UTF-8，URL 路径 `encodeURIComponent` |
| 限流 | 登录/setup 每 IP 每分钟 5 次；其他每用户每分钟 60 次 |

---

## 6. 鉴权流程

### 6.1 注册（仅一次）

```
┌────────────────────────────────────────────────┐
│  首次访问：GET /api/setup/status               │
│  返回 { hasAccount: false }                     │
└────────────────────┬───────────────────────────┘
                     ▼
┌────────────────────────────────────────────────┐
│  前端展示"创建账号"表单                          │
│  用户填写：用户名 + 密码 + 确认密码             │
│  提交：POST /api/auth/setup                    │
│    body: { username, password }                 │
└────────────────────┬───────────────────────────┘
                     ▼
┌────────────────────────────────────────────────┐
│  服务端：                                       │
│    1. 查 users 表，COUNT(*) == 0？             │
│       否 → 409 ALREADY_INITIALIZED             │
│    2. bcrypt.hash(password) → 存 users         │
│    3. 签 JWT，种 cookie                         │
│    4. 201 { username }                          │
└────────────────────┬───────────────────────────┘
                     ▼
              进入主界面
```

### 6.2 登录

```
┌────────────────────────────────────────────────┐
│  POST /api/auth/login                          │
│    body: { username, password }                 │
│  服务端：                                       │
│    1. 查 users（按 username）                  │
│    2. bcrypt.compare(password, password_hash)   │
│    3. 失败 → 401 INVALID_CREDENTIALS           │
│    4. 成功 → 签 JWT，种 cookie                  │
│    5. 200 { username }                          │
└────────────────────────────────────────────────┘
```

### 6.3 Cookie 与 JWT

```
tf_access   JWT access token，15 分钟
            httpOnly, secure, sameSite=Lax, path=/

tf_refresh  32 字节随机 base64
            httpOnly, secure, sameSite=Lax, path=/api/auth
            30 天有效，存 sessions 表
```

JWT payload：
```json
{ "sub": "user:1", "username": "liubleed", "iat": ..., "exp": ... }
```

签名：HS256，密钥 32 字节随机，存 `.env` 的 `JWT_SECRET`。

### 6.4 路由守卫

前端无需 vue-router 复杂守卫：
- 启动时调 `GET /api/setup/status`
  - `false` → 显示"创建账号"
  - `true` → 调 `GET /api/auth/me`
    - 200 → 显示主界面
    - 401 → 显示"登录"

### 6.5 安全清单

- [x] 密码 bcrypt 哈希（cost = 12）
- [x] 密码最少 8 位
- [x] 用户名 3-32 位，仅 `[a-z0-9_-]`
- [x] JWT HS256 + 强密钥
- [x] cookie 全 `httpOnly + secure + sameSite=Lax`
- [x] refresh token 存 DB 可吊销
- [x] 单账号 CHECK 约束
- [x] 限流：登录/setup 每 IP 每分钟 5 次

### 6.6 环境变量

```bash
JWT_SECRET=<32 字节随机>
COOKIE_DOMAIN=app.example.com  # 可选
COOKIE_SECURE=true              # 生产必须 true
PORT=3000
DATABASE_URL=file:/data/topfiles.db
FRONTEND_URL=https://app.example.com
```

---

## 7. 前端改造

### 7.1 单页布局（最简版）

**砍掉路由**：整个应用就一个页面（`App.vue`），根据登录态显示不同 UI。

```
未登录态：
┌──────────────────────────────────────┐
│       TopFiles                       │
│  ┌────────────────────────────────┐  │
│  │  创建账号 / 登录                │  │
│  │  [用户名______]                 │  │
│  │  [密码________]                 │  │
│  │  [ 登录 / 创建 ]                │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘

登录态：
┌─────────────────────────────────────────────────┐
│  TopFiles                          [分享] [保存] │
├─────────────┬───────────────────────────────────┤
│  📄 a.md    │  文件名：[a.md            ]       │
│  📄 b.yml   │  ─────────────────────────────────  │
│  📄 c.json  │                                   │
│             │  [CodeMirror 编辑区]              │
│  [+ 新建]   │                                   │
│             │                                   │
│  ⚙️ 设置    │                                   │
└─────────────┴───────────────────────────────────┘
```

### 7.2 状态管理

```typescript
// src/stores/auth.ts
export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ username: string } | null>(null)
  const isInitialized = ref(false)
  
  async function init() {
    const status = await api.get('/api/setup/status')
    if (!status.hasAccount) {
      isInitialized.value = false
      return
    }
    isInitialized.value = true
    try {
      user.value = await api.get('/api/auth/me')
    } catch {}
  }
  
  async function setup(username, password) { ... }
  async function login(username, password) { ... }
  async function logout() { user.value = null }
  
  return { user, isInitialized, init, setup, login, logout }
})

// src/stores/files.ts
export const useFilesStore = defineStore('files', () => {
  const list = ref<FileMeta[]>([])
  const current = ref<FileDetail | null>(null)
  
  async function fetchList() { list.value = await api.get('/api/files') }
  async function create(payload) { ... }
  async function update(id, payload) { ... }
  async function remove(id) { ... }
  async function setVisibility(id, visibility) { ... }
  async function loadFile(id) { current.value = await api.get(`/api/files/${id}`) }
  
  return { list, current, fetchList, create, update, remove, setVisibility, loadFile }
})
```

### 7.3 三个视图组件

| 组件 | 作用 | 显示条件 |
|---|---|---|
| `SetupView.vue` | 首次注册表单 | `!isInitialized` |
| `LoginView.vue` | 登录表单 | `isInitialized && !user` |
| `MainView.vue` | 侧边栏 + 编辑器 | `user` 已登录 |

`App.vue` 只是三选一：
```vue
<template>
  <SetupView v-if="!isInitialized" />
  <LoginView v-else-if="!user" />
  <MainView v-else />
</template>
```

### 7.4 MainView 结构

```vue
<template>
  <div class="main-layout">
    <aside class="sidebar">
      <button @click="newFile">+ 新建</button>
      <ul>
        <li v-for="f in files" :key="f.id"
            :class="{ active: current?.id === f.id }"
            @click="loadFile(f.id)">
          <span class="icon">📄</span>
          <span class="name">{{ f.filename }}</span>
          <button @click.stop="deleteFile(f.id)" class="delete">×</button>
        </li>
      </ul>
      <button @click="logout" class="logout">⚙️ 注销</button>
    </aside>
    
    <main class="editor">
      <div class="toolbar">
        <input v-model="filename" />
        <select v-model="mimeType">…</select>
        <button @click="save">保存</button>
        <button @click="share" :disabled="!current">分享</button>
      </div>
      
      <CodeEditor v-model="content" :language="language" />
    </main>
    
    <ShareDialog v-model:open="shareOpen" :file="current" />
  </div>
</template>
```

### 7.5 分享弹窗

```vue
<Modal v-model:open="open">
  <h2>分享文件</h2>
  
  <div v-if="file.visibility === 'public'">
    <p>任何人可通过以下链接访问：</p>
    <CopyableInput :value="shareUrl" />
  </div>
  
  <div v-else>
    <p>此文件目前为私密。</p>
    <button @click="enableShare">生成分享链接</button>
  </div>
  
  <button @click="disableShare" v-if="file.visibility === 'public'">
    取消分享
  </button>
</Modal>
```

### 7.6 与现有草稿兼容

```
未登录用户：完全使用现有功能
  - 编辑 → localStorage 草稿
  - 下载按钮照常工作
  - 但 "保存" / "分享" 按钮显示为灰色，hover 提示"登录后可用"

登录用户：进入 MainView，使用云端
  - 现有编辑器组件原样复用
  - 现有 localStorage 草稿逻辑保留作为"未保存前"的本地缓存
```

---

## 8. 直链服务

### 8.1 路径

```
GET /u/:username/:filename
```

例：`https://app.example.com/u/liubleed/notes.md`

### 8.2 服务端逻辑

```typescript
fastify.get('/u/:username/:filename', async (req, reply) => {
  const { username, filename } = req.params
  
  const user = await db.query.users.findFirst({ 
    where: eq(users.username, username.toLowerCase()) 
  })
  if (!user) return reply.status(404).send('Not found')
  
  const file = await db.query.files.findFirst({ 
    where: and(
      eq(files.filename, filename.toLowerCase()),
      eq(files.visibility, 'public')
    ) 
  })
  if (!file) return reply.status(404).send('Not found')
  
  return reply
    .header('Content-Type', file.mimeType)
    .header('Content-Disposition', `inline; filename="${file.filename}"`)
    .header('Cache-Control', 'public, max-age=300')
    .send(file.content)
})
```

### 8.3 关键点

- 私密文件 → 404（**不区分"不存在"和"无权限"**，避免信息泄露）
- 浏览器内预览：浏览器根据 mime 自动渲染（图片直接显示，文本/MD 直接显示，代码按高亮显示）
- 缓存：5 分钟（Cloudflare/反代可再加速）

---

## 9. 部署

### 9.1 Docker Compose

```yaml
# docker-compose.yml
version: '3.9'

services:
  app:
    build: ./server
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: file:/data/topfiles.db
      JWT_SECRET: ${JWT_SECRET}
      FRONTEND_URL: ${FRONTEND_URL}
      COOKIE_SECURE: "true"
    volumes:
      - ./data:/data

  web:
    build: ./web
    restart: unless-stopped
    ports:
      - "8080:80"
    depends_on:
      - app
```

后端和前端可以**共用一个镜像**（多阶段构建：先 build 前端成静态文件，再打进最终镜像由 Fastify 同时 serve `/api` 和 `/`）。

### 9.2 反向代理

```nginx
server {
  listen 443 ssl http2;
  server_name app.example.com;
  
  ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
  
  location / {
    proxy_pass http://127.0.0.1:8080;
  }
}
```

简单到不用分 api/ 反代 — 同一端口同一应用分发。

### 9.3 启动

```bash
# 1. 生成 JWT 密钥
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env

# 2. 起服务
docker compose up -d

# 3. 浏览器访问 https://app.example.com
#    首次访问会显示"创建账号"页
```

### 9.4 备份

```bash
# 每天凌晨备份一次
docker compose exec app sqlite3 /data/topfiles.db ".backup /data/backups/db-$(date +%Y%m%d).db"
```

或者更简单：用 cron 在宿主机执行：
```bash
cp /opt/topfiles/data/topfiles.db /opt/topfiles/backups/db-$(date +%Y%m%d).db
```

### 9.5 部署 checklist

- [ ] 域名 + DNS
- [ ] HTTPS 证书
- [ ] `.env` 文件 700 权限
- [ ] 数据目录挂载到持久卷
- [ ] 防火墙只开 80/443
- [ ] 备份恢复演练

---

## 10. 错误处理与测试

### 10.1 错误类型

```typescript
class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) { super(message) }
}
```

### 10.2 错误码

| HTTP | Code | 触发 | 提示 |
|---|---|---|---|
| 400 | `INVALID_REQUEST` | 参数缺失/格式错 | 请求格式有误 |
| 400 | `INVALID_CREDENTIALS` | 用户名或密码错 | 用户名或密码错误 |
| 400 | `WEAK_PASSWORD` | 密码 < 8 位 | 密码至少 8 位 |
| 401 | `UNAUTHENTICATED` | 未登录 | 请先登录 |
| 401 | `TOKEN_EXPIRED` | refresh 失败 | 登录已过期 |
| 404 | `NOT_FOUND` | 文件/资源不存在 | 不存在 |
| 409 | `ALREADY_INITIALIZED` | 已注册过账号 | 系统已存在账号 |
| 409 | `FILENAME_CONFLICT` | 同名文件 | 同名文件已存在 |
| 413 | `CONTENT_TOO_LARGE` | > 1MB | 内容超出 1MB 限制 |
| 429 | `RATE_LIMITED` | 限流 | 请求过于频繁 |
| 500 | `INTERNAL` | 未捕获 | 服务器开小差 |

### 10.3 全局处理

```typescript
fastify.setErrorHandler((err, req, reply) => {
  if (err instanceof AppError) {
    return reply.status(err.statusCode).send({
      error: { code: err.code, message: err.message }
    })
  }
  logger.error({ err, path: req.url }, 'unhandled error')
  return reply.status(500).send({
    error: { code: 'INTERNAL', message: '服务器开小差' }
  })
})
```

### 10.4 测试三层

**1. 单元（Vitest）**：
- filename 规范化（lowercase、非法字符、Unicode）
- bcrypt hash 验证
- share URL 生成
- 限流逻辑

**2. 集成（Vitest + 真实 SQLite）**：
- 注册 → 登录 → 创建文件 → 分享 → 公开访问完整流程
- 重复注册返回 409
- 错误码 400/401/404/409/413 各分支
- 单账号 CHECK 约束

**3. 端到端（Playwright）**：
- 首次访问 → 创建账号 → 创建文件 → 分享 → 复制直链 → 退出登录 → 隐身窗打开直链

**4. 手动 smoke**：
- [ ] 首次访问看到"创建账号"
- [ ] 注册后跳到主界面
- [ ] 注销后看到"登录"
- [ ] 第二次访问（已注册）直接看到"登录"
- [ ] 输错密码 → 401
- [ ] 创建文件 → 侧边栏出现
- [ ] 编辑 → 刷新页面内容还在
- [ ] 分享 → 复制直链
- [ ] 隐身窗打开直链 → 看到内容
- [ ] 私密文件直链 → 404
- [ ] 同名文件创建 → 409
- [ ] 超过 1MB 内容 → 413

### 10.5 监控

- **Sentry**（免费版）：5xx 错误
- **pino** 结构化日志 → stdout → `docker logs`
- **健康检查**：`GET /api/health` → `{ status: 'ok' }`
- **不引入** Grafana / Prometheus

---

## 11. 目录结构

```
TopFiles/
├── src/                          # 前端
│   ├── api/client.ts             # axios 实例
│   ├── stores/
│   │   ├── auth.ts
│   │   └── files.ts
│   ├── views/
│   │   ├── SetupView.vue         # 首次注册
│   │   ├── LoginView.vue
│   │   └── MainView.vue          # 侧边栏 + 编辑器
│   ├── components/
│   │   ├── ShareDialog.vue
│   │   ├── CopyableInput.vue
│   │   ├── Sidebar.vue
│   │   ├── TopBar.vue
│   │   └── ...（现有组件）
│   ├── App.vue                   # 改造：只做三选一
│   └── ...
├── server/                       # 后端（新）
│   ├── src/
│   │   ├── server.ts             # fastify 入口
│   │   ├── config/env.ts
│   │   ├── db/
│   │   │   ├── schema.ts         # drizzle
│   │   │   ├── client.ts
│   │   │   └── migrations/
│   │   ├── auth/
│   │   │   ├── routes.ts
│   │   │   ├── password.ts       # bcrypt
│   │   │   └── jwt.ts
│   │   ├── files/
│   │   │   ├── routes.ts
│   │   │   └── service.ts
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
├── docs/superpowers/specs/2026-07-08-topfiles-share-design.md
├── docker-compose.yml
├── package.json                  # 前端
└── ...
```

---

## 12. 未来扩展（out of scope for MVP）

- 多用户注册
- 二进制文件支持（图片/pdf）
- 文件夹/层级
- 文件搜索/分页
- GitHub 同步
- 实时协作
- 邮件通知
- CDN 加速

---

## 13. 待定项

开发时间 / 实施优先级待与产品决策后确定。
