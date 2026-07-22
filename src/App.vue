<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useFilesStore } from './stores/files'
import LoginView from './views/LoginView.vue'
import SetupView from './views/SetupView.vue'

const LegacyEditor = defineAsyncComponent(() => import('./components/LegacyEditor.vue'))

const auth = useAuthStore()
const files = useFilesStore()
const showAuthModal = ref(false)
const themeMode = ref<'light' | 'dark'>('light')
const sidebarOpen = ref(false)

function onLoginClick() {
  showAuthModal.value = true
}

function onAuthClose() {
  showAuthModal.value = false
}

function detectTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem('themeMode')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', mode)
}

onMounted(() => {
  auth.init()
  themeMode.value = detectTheme()
  applyTheme(themeMode.value)
})

watch(themeMode, (mode) => {
  applyTheme(mode)
  localStorage.setItem('themeMode', mode)
})

watch(() => auth.isLoggedIn, (loggedIn) => {
  if (!loggedIn) {
    files.clearAll()
    sidebarOpen.value = false
  }
})

</script>

<template>
  <!-- 登录按钮（右上角，只在未登录时显示） -->
  <button
    v-if="!auth.isLoggedIn"
    class="global-login-trigger"
    @click="onLoginClick"
  >
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
      <path d="M20 21V19C20 16.8 18.2 15 16 15H8C5.8 15 4 16.8 4 19V21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.8" />
    </svg>
    <span>登录 / 注册</span>
  </button>

  <!-- 主界面：始终显示编辑器，登录后左侧加文件列表 -->
  <div class="app-layout">
    <button v-if="auth.isLoggedIn" class="mobile-files-toggle" aria-label="打开文件列表" @click="sidebarOpen = true">
      文件
    </button>
    <!-- 左侧文件列表（只在登录后显示） -->
    <aside v-if="auth.isLoggedIn" class="sidebar" :class="{ open: sidebarOpen }">
      <Sidebar @close-mobile="sidebarOpen = false" />
    </aside>

    <!-- 右侧编辑器区域（始终显示） -->
    <main class="editor-main">
      <LegacyEditor />
    </main>
  </div>

  <!-- 自定义弹窗 -->
  <CustomDialog />

  <!-- 登录/注册弹窗 -->
  <div v-if="showAuthModal" class="auth-modal-overlay" @click.self="onAuthClose">
    <div class="auth-modal-content">
      <button class="auth-modal-close" @click="onAuthClose">×</button>
      <SetupView v-if="auth.isInitialized === false" @success="onAuthClose" />
      <LoginView v-else-if="auth.isInitialized === true" @success="onAuthClose" />
      <div v-else class="auth-loading">加载中...</div>
    </div>
  </div>
</template>

<script lang="ts">
import Sidebar from './components/Sidebar.vue'
import CustomDialog from './components/CustomDialog.vue'

export default {
  components: { Sidebar, CustomDialog }
}
</script>

<style>
/* 主布局：flex 左右排列 */
.app-layout {
  display: flex;
  min-height: 100dvh;
  width: 100%;
  padding: 14px;
  gap: 14px;
}

/* 左侧文件列表 */
.sidebar {
  width: 264px;
  min-width: 264px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--bg-card);
  backdrop-filter: blur(22px);
  box-shadow: var(--surface-shadow);
  overflow-y: auto;
  flex-shrink: 0;
}
.mobile-files-toggle { display: none; }
@media (max-width: 767px) {
  .sidebar { position: fixed; inset: 0 auto 0 0; z-index: 2500; width: min(88vw, 320px); min-width: 0; transform: translateX(-105%); transition: transform .2s ease-out; box-shadow: 12px 0 32px rgba(0,0,0,.18); }
  .sidebar.open { transform: translateX(0); }
  .mobile-files-toggle { display: block; position: fixed; z-index: 1200; left: 12px; top: 12px; min-height: 44px; padding: 0 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-card); color: var(--text-main); font-weight: 600; }
}
[data-theme="dark"] .sidebar {
  background: #1a1a1a;
  border-color: #333;
}

/* 右侧编辑器（flex: 1 填满剩余空间） */
.editor-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--bg-card);
  box-shadow: var(--surface-shadow);
}

/* 登录按钮（固定在右上角） */
.global-login-trigger {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(100, 100, 100, 0.3);
  min-height: 40px;
  border-radius: 12px;
  background: var(--bg-card);
  backdrop-filter: blur(22px);
  color: var(--text-main);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--surface-shadow);
}
.global-login-trigger:hover {
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
[data-theme="dark"] .global-login-trigger {
  background: rgba(30, 30, 30, 0.9);
  border-color: rgba(100, 100, 100, 0.3);
  color: #eee;
}
[data-theme="dark"] .global-login-trigger:hover {
  background: rgba(40, 40, 40, 1);
}

/* 登录弹窗 */
.auth-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(28, 28, 30, 0.28);
  backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.auth-modal-content {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 22px;
  box-shadow: var(--surface-shadow);
  backdrop-filter: blur(28px);
  max-width: 420px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}
[data-theme="dark"] .auth-modal-content {
  background: #1e1e1e;
  color: #e0e0e0;
}
.auth-modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 40px;
  height: 40px;
  border: none;
  background: rgba(120, 120, 128, 0.12);
  border-radius: 50%;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  z-index: 10;
}
[data-theme="dark"] .auth-modal-close {
  background: rgba(255, 255, 255, 0.1);
  color: #aaa;
}
.auth-modal-close:hover {
  background: rgba(0, 0, 0, 0.1);
}
[data-theme="dark"] .auth-modal-close:hover {
  background: rgba(255, 255, 255, 0.2);
}
.auth-loading {
  padding: 2rem;
  text-align: center;
  color: #666;
}

/* 弹窗内表单样式 */
.auth-modal-content .auth-page {
  min-height: auto;
  padding: 0;
}
.auth-modal-content .card {
  border: none;
  box-shadow: none;
  padding: 2rem;
  background: transparent;
}
[data-theme="dark"] .auth-modal-content .card {
  background: transparent;
  color: #e0e0e0;
}

/* 暗黑模式：输入框等 - 使用 !important 覆盖 scoped 样式 */
[data-theme="dark"] .auth-modal-content input {
  background: #2a2a2a !important;
  border-color: #444 !important;
  color: #e0e0e0 !important;
}
[data-theme="dark"] .auth-modal-content button[type="submit"] {
  background: #3b82f6 !important;
  color: white !important;
}
[data-theme="dark"] .auth-modal-content h1 {
  color: #e0e0e0 !important;
}
[data-theme="dark"] .auth-modal-content .hint {
  color: #888 !important;
}
[data-theme="dark"] .auth-modal-content .err {
  color: #f87171 !important;
}
[data-theme="dark"] .auth-modal-content label > span {
  color: #ccc !important;
}
[data-theme="dark"] .auth-modal-content .err-banner {
  background: rgba(239, 68, 68, 0.15) !important;
  color: #f87171 !important;
}
[data-theme="dark"] .auth-modal-content .auth-loading {
  color: #888 !important;
}
[data-theme="dark"] .auth-modal-content .card {
  background: transparent !important;
  color: #e0e0e0 !important;
}
</style>
