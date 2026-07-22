# TopFiles UI 设计审计报告

> **状态：全部修复完成** (2026-07-22)

## 修复记录

| # | 问题 | 修复方式 |
|---|------|---------|
| 1 | 僵尸组件 MainView.vue | 已删除 |
| 2 | 三套暗黑模式互相覆盖 | 统一为 `style.css` CSS 变量体系，删除 App.vue/LoginView/SetupView 中的硬编码覆盖和 12 处 `!important` |
| 3 | 两套主题状态管理 | 创建 `src/composables/useTheme.ts` 统一管理，LegacyEditor 和 App.vue 共享同一实例 |
| 4 | CSS 变量命名不一致 | `var(--bg, #fafafa)` → `var(--bg-panel)`，所有组件统一使用 style.css 定义的变量 |
| 5 | 响应式断点不统一 | 全部统一为 768px |
| 6 | 字体大小滑块不可见 | `opacity: 0` → `opacity: 0.85`，始终可见 |
| 7 | LoginView/SetupView 重复样式 | 提取到 `style.css` 的 `.auth-card` 全局样式体系，两个视图的 `<style scoped>` 已清空 |
| 8 | 主题切换无过渡 | 添加 `transition: background-color 0.25s, border-color 0.25s, color 0.2s` |
| 9 | 设计令牌缺失 | 添加 `--space-1..6`、`--radius-sm/md/lg/xl` |

---

## 一、架构层面问题

### 1.1 僵尸组件：MainView.vue 完全未使用

`MainView.vue` 是一个完整的视图组件，包含独立的 `.main` 布局、独立的 toolbar、独立的样式系统，但**在整个项目中没有被任何组件引用**。它内部还重复导入了 `Sidebar`、`CodeEditor`、`ShareDialog`，如果被误用会导致组件重复挂载。

**影响**：增加维护成本，混淆开发者对实际 UI 结构的理解。

### 1.2 两个独立的主题状态管理

- `App.vue` 拥有 `themeMode`，存储 key 为 `"themeMode"`
- `LegacyEditor.vue` 也拥有自己的 `themeMode`，存储 key 为 `"file-builder-theme"`

两者各自调用 `detectTheme()` 和 `applyTheme()`，互不同步。用户在 `LegacyEditor` 内切换主题后，`App.vue` 的状态不会更新，反之亦然。

## 二、样式系统问题

### 2.1 三套暗黑模式实现互相覆盖

| 来源 | 实现方式 | 颜色来源 |
|------|---------|---------|
| `style.css` | `[data-theme='dark']` CSS 变量 | `--bg-panel: #1f2430` 等 |
| `App.vue` | `[data-theme="dark"]` 硬编码 | `sidebar: #1a1a1a`, `modal: #1e1e1e` |
| `LoginView/SetupView` | `:global([data-theme])` | `card: #1e1e1e`, `input: #2a2a2a` |

`style.css` 中有 **12 处 `!important`** 用于强制覆盖暗黑模式样式，`App.vue` 中还有更多。这说明暗黑模式是在原有设计之上"打补丁"而非系统化实现。

### 2.2 CSS 变量命名不一致

- `style.css` 定义了 `--bg-panel`、`--bg-card`、`--bg-page`
- `App.vue` 的 sidebar 引用了 `var(--bg, #fafafa)` — 一个**不存在的变量**
- `ShareDialog.vue` 用 `var(--bg-card, white)` 带回退值
- `CopyableInput.vue` 用 `var(--bg-panel, white)` 带回退值

同一概念在不同组件中有不同的变量名，部分组件还引用了根本不存在的变量。

### 2.3 单位混用

- `style.css`：全部使用 `px`
- `MainView.vue`：全部使用 `rem`
- `LoginView.vue` / `SetupView.vue`：`rem` 和 `px` 混合使用
- `Sidebar.vue`：`px` 和 `rem` 混合

### 2.4 大量重复样式

`LoginView.vue` 和 `SetupView.vue` 的 `<style>` 块几乎完全相同（`.auth-page`、`.card`、`input`、`button` 等规则一字不差），应提取为共享样式。

## 三、视觉设计问题

### 3.1 缺少统一的设计令牌层

没有定义间距（spacing scale）、圆角（radius scale）、阴影（shadow scale）等设计令牌。每个组件自行决定 padding、margin、border-radius 的值，导致：
- 圆角值散布在 4px、6px、8px、10px、12px、16px 之间
- 间距没有统一节奏（14px、12px、10px、8px、6px 随意使用）

### 3.2 字体大小滑块的交互问题

`LegacyEditor.vue` 中的字体大小滑块默认 `opacity: 0`，hover 编辑器区域时变为 `opacity: 0.5`，hover 滑块本身才变为 `1`。这个交互逻辑不符合直觉——用户很难发现这个功能的存在。

### 3.3 登录按钮脱离布局

`App.vue` 中的"登录/注册"按钮使用 `position: fixed` 固定在右上角，完全脱离文档流。它有自己的独立暗黑模式处理（`background: rgba(30, 30, 30, 0.9)`），与全局主题系统脱节。

### 3.4 缺少过渡动画

主题切换时没有任何过渡效果（`transition`），颜色瞬间跳变，体验生硬。

## 四、响应式设计问题

### 4.1 断点不统一

| 来源 | 断点 |
|------|------|
| `style.css` | `max-width: 880px` |
| `App.vue` | `max-width: 767px` |
| `Sidebar.vue` | `max-width: 767px` |

缺少统一的响应式策略和断点定义。

### 4.2 移动端体验

- 未登录时编辑器占满全屏，登录按钮浮在右上角可能遮挡内容
- 移动端文件列表通过 `position: fixed` 抽屉实现，但缺少遮罩层和关闭手势
- toolbar 在窄屏下变为单列，但按钮排列没有优化

## 五、可访问性问题

### 5.1 焦点管理不一致

`LegacyEditor.vue` 对模态框做了较好的焦点陷阱（focus trap），但 `App.vue` 的登录弹窗、`Sidebar.vue` 的修改密码弹窗、`ShareDialog.vue` 都没有焦点管理。

### 5.2 SVG 图标标注不统一

部分图标有 `aria-label` 和 `title`，部分只有 `aria-hidden="true"` 但无文字替代。`Sidebar.vue` 中的删除按钮使用文字 `×` 而非 `aria-label`。

## 六、改进建议

### 6.1 短期（低风险）

1. **删除 `MainView.vue`** — 确认未被引用后移除
2. **统一主题管理** — 将主题状态提升到 Pinia store 或单一 composable
3. **消除 `!important`** — 重构暗黑模式，让 CSS 变量覆盖自然生效
4. **统一 CSS 变量命名** — 所有组件引用 `style.css` 中定义的变量，移除硬编码颜色

### 6.2 中期

5. **建立设计令牌层** — 在 `:root` 中定义间距、圆角、阴影、字号等令牌
6. **提取共享样式** — 将 `LoginView` 和 `SetupView` 的公共样式提取为共享 CSS
7. **统一响应式断点** — 定义 `--bp-sm`、`--bp-md` 等断点变量或 mixin
8. **添加主题切换过渡** — `transition: background-color 0.2s, color 0.2s`

### 6.3 长期

9. **考虑引入 UI 组件库** — 如 Naive UI、PrimeVue 等，减少手写 CSS 的维护负担
10. **统一焦点管理和可访问性** — 所有模态框实现 focus trap，所有图标确保有文字替代
