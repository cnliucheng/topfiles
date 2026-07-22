# 苹果风工作区 UI 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 TopFiles 的工作区和弹窗统一为以石墨灰、暖白与克制蓝色为核心的苹果风界面。

**Architecture:** `style.css` 提供语义化表面、边框、阴影与焦点令牌；App 和 Sidebar 定义工作区结构；各弹窗继承同一浮层语言。

**Tech Stack:** Vue 3、CSS 自定义属性、CodeMirror 6。

---

### Task 1: 主题令牌与页面表面

- [ ] 在 `src/style.css` 定义暖白、石墨灰、表面、分隔、阴影、焦点蓝与暗黑等令牌。
- [ ] 让页面背景与按钮焦点使用令牌，避免组件内大面积原始蓝色。
- [ ] 运行 `npm run build`。

### Task 2: 文件工作区

- [ ] 重构 `src/App.vue` 与 `src/components/Sidebar.vue` 的侧栏/编辑区表面、分组、主操作、文件行与移动抽屉。
- [ ] 保持已有事件和状态接口不变，关键触控操作为 44px。
- [ ] 运行 `npm run build`。

### Task 3: 弹窗和认证

- [ ] 统一 `LoginView.vue`、`SetupView.vue`、`ShareDialog.vue` 与 App 弹层的圆角、描边、阴影、焦点和错误样式。
- [ ] 运行 `npm run build` 和 `server/npm test`。
