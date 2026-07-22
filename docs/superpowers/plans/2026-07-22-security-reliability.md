# TopFiles 安全与可靠性修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复公开分享执行风险、服务端测试资源泄漏、自动保存竞态、生产 Cookie 配置与编辑器首屏体积。

**Architecture:** 分享端点固定纯文本输出。测试助手拥有数据库与 server 的完整生命周期。自动保存以防抖后的单一队列提交最新快照。Vue 异步组件将 CodeMirror 移出初始入口包。

**Tech Stack:** Node.js、Vitest、better-sqlite3、Vue 3、Vite、CodeMirror 6。

---

### Task 1: 公开分享安全

**Files:**
- Modify: `server/src/share/routes.js`
- Modify: `server/test/share.test.js`

- [ ] **Step 1: 写入失败测试**

```js
it('serves JavaScript files as text/plain to prevent same-origin execution', async () => {
  ctx.db.prepare('INSERT INTO files (filename, content, mime_type, size_bytes) VALUES (?, ?, ?, ?)')
    .run('evil.js', 'fetch("/api/files")', 'application/javascript; charset=utf-8', 19)
  const res = await request(server, 'GET', '/u/evil.js')
  expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
})
```

- [ ] **Step 2: 运行测试，确认当前返回 JavaScript MIME 而失败。**
- [ ] **Step 3: 将 `safeContentType` 改为无条件返回 `text/plain; charset=utf-8`。**
- [ ] **Step 4: 运行分享测试，确认通过。**

### Task 2: 测试资源生命周期

**Files:**
- Modify: `server/test/helpers.js`
- Modify: `server/test/*.test.js`

- [ ] **Step 1: 先让测试上下文暴露 `async close()`，其依次关闭 server 和 db；所有 `afterEach/afterAll` 改为 `await ctx.close()`。**
- [ ] **Step 2: 运行 `npm test`，确认现有测试仍因未实现关闭逻辑而超时。**
- [ ] **Step 3: 实现 `closeServer(server)`（等待 `server.close` 回调）和 `ctx.close()`（关闭 db 后删除 SQLite 三个文件）；请求助手等待 `server.close`。**
- [ ] **Step 4: 运行 `npm test`，确认无超时且全套通过。**

### Task 3: 自动保存顺序

**Files:**
- Modify: `src/components/LegacyEditor.vue`

- [ ] **Step 1: 为云端自动保存增加 `queueCloudSave(content)`：500ms 防抖、每次仅保留最新快照、上一次 `filesStore.update` 完成后才发送下一次。**
- [ ] **Step 2: 把 `saveDraft` 中直接调用的 `filesStore.update` 替换为 `queueCloudSave`；组件卸载时清除计时器。**
- [ ] **Step 3: 运行前端构建，确认 TypeScript 编译通过。**

### Task 4: 生产配置与前端拆包

**Files:**
- Modify: `server/server.js`
- Modify: `src/App.vue`
- Modify: `vite.config.ts`

- [ ] **Step 1: 添加生产环境缺少 `COOKIE_SECURE=true` 的失败测试或启动检查。**
- [ ] **Step 2: 在生产环境将缺少 `COOKIE_SECURE` 从警告改为启动失败。**
- [ ] **Step 3: 使用 `defineAsyncComponent` 异步加载 `LegacyEditor`，为 Vite 配置稳定的 CodeMirror 手动 chunk。**
- [ ] **Step 4: 运行服务端测试和 `npm run build`，确认所有验证通过并检查构建产物。**

### Task 5: 最终验证

**Files:**
- Verify only

- [ ] **Step 1: 运行 `npm test`（目录 `server`）。**
- [ ] **Step 2: 运行 `npm run build`（仓库根目录）。**
- [ ] **Step 3: 审查 `git diff --check` 与 `git status --short`。**
- [ ] **Step 4: 使用中文提交说明提交修复。**
