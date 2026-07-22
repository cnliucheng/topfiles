# 文件工作区侧边栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提升登录后文件工作区的层级、触达性与窄屏体验，并清理登录会话残留状态。

**Architecture:** Sidebar 提供抽屉状态与文件操作菜单；App 在窄屏提供打开入口；auth/files store 在登出时清理本地文件状态。

**Tech Stack:** Vue 3、Pinia、CSS。

---

### Task 1: 会话状态

- [ ] 让登出成功后清空 `useFilesStore` 的列表和当前文件；保存请求共享同一串行队列。
- [ ] 用前端构建验证类型与模板。

### Task 2: 侧边栏工作区

- [ ] 以账户、文件标题/计数、主新建按钮、文件操作菜单与中性设置/危险退出重组 Sidebar。
- [ ] 添加 768px 以下的覆盖式抽屉与可访问的打开/关闭按钮。
- [ ] 运行 `npm run build` 验证。
