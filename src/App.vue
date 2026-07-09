<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuthStore } from './stores/auth'
import LegacyEditor from './components/LegacyEditor.vue'
import SetupView from './views/SetupView.vue'
import LoginView from './views/LoginView.vue'
import MainView from './views/MainView.vue'

const auth = useAuthStore()
const showAuthModal = ref(false)

// 登录按钮：弹出 LoginView 或 SetupView
function onLoginClick() {
  showAuthModal.value = true
}

function onAuthClose() {
  showAuthModal.value = false
}

onMounted(() => {
  auth.init()
})
</script>

<template>
  <!-- 已登录：云端主界面 -->
  <MainView v-if="auth.isLoggedIn" />

  <!-- 未登录：原版编辑器 + 登录入口 -->
  <div v-else class="app-wrapper">
    <LegacyEditor />
    <!-- 登录按钮（固定在工具栏右侧） -->
    <button class="global-login-trigger" @click="onLoginClick">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
        <path d="M20 21V19C20 16.8 18.2 15 16 15H8C5.8 15 4 16.8 4 19V21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.8" />
      </svg>
      <span>登录 / 注册</span>
    </button>
  </div>

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

<style>
/* 全局样式：登录按钮固定在工具栏右侧 */
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
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  color: #333;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
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
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.auth-modal-content {
  position: relative;
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
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
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(0, 0, 0, 0.05);
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

/* SetupView/LoginView 需要适配弹窗 */
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

.app-wrapper {
  position: relative;
  min-height: 100vh;
}

/* 暗黑模式：SetupView/LoginView 内部元素 */
[data-theme="dark"] .auth-modal-content :deep(input) {
  background: #2a2a2a;
  border-color: #444;
  color: #e0e0e0;
}
[data-theme="dark"] .auth-modal-content :deep(button[type="submit"]) {
  background: #3b82f6;
  color: white;
}
[data-theme="dark"] .auth-modal-content :deep(h1) {
  color: #e0e0e0;
}
[data-theme="dark"] .auth-modal-content :deep(.hint) {
  color: #888;
}
[data-theme="dark"] .auth-modal-content :deep(.err) {
  color: #f87171;
}
[data-theme="dark"] .auth-modal-content :deep(label > span) {
  color: #ccc;
}
[data-theme="dark"] .auth-modal-content :deep(.err-banner) {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}
[data-theme="dark"] .auth-modal-content :deep(.auth-loading) {
  color: #888;
}
</style>
