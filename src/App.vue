<script setup lang="ts">
import { defineAsyncComponent, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from './stores/auth'
import { useFilesStore } from './stores/files'
import { useUiStore } from './stores/ui'
import LoginView from './views/LoginView.vue'
import SetupView from './views/SetupView.vue'

const LegacyEditor = defineAsyncComponent(() => import('./components/LegacyEditor.vue'))
const { t } = useI18n()

const auth = useAuthStore()
const files = useFilesStore()
const ui = useUiStore()

watch(() => auth.isLoggedIn, (loggedIn) => {
  if (!loggedIn) {
    files.clearAll()
    ui.sidebarOpen = false
  }
})

onMounted(() => {
  auth.init()
})
</script>

<template>
  <!-- 主界面：始终显示编辑器，登录后左侧加文件列表 -->
  <div class="app-layout">
    <!-- 左侧文件列表（只在登录后显示） -->
    <aside v-if="auth.isLoggedIn" class="sidebar" :class="{ open: ui.sidebarOpen }">
      <Sidebar @close-mobile="ui.sidebarOpen = false" />
    </aside>

    <!-- 移动端侧栏遮罩 -->
    <div
      v-if="auth.isLoggedIn && ui.sidebarOpen"
      class="sidebar-scrim"
      @click="ui.sidebarOpen = false"
    ></div>

    <!-- 右侧编辑器区域（始终显示） -->
    <main class="editor-main">
      <LegacyEditor />
    </main>
  </div>

  <!-- 自定义弹窗 -->
  <CustomDialog />

  <!-- 登录/注册弹窗 -->
  <div v-if="ui.authModalOpen" class="auth-modal-overlay" @click.self="ui.closeAuthModal">
    <div class="auth-modal-content">
      <button class="auth-modal-close" :aria-label="t('cancel')" @click="ui.closeAuthModal">&times;</button>
      <SetupView v-if="auth.isInitialized === false" @success="ui.closeAuthModal" />
      <LoginView v-else-if="auth.isInitialized === true" @success="ui.closeAuthModal" />
      <div v-else class="auth-loading">{{ t('loading') }}</div>
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
/* 主布局：全幅 flex 左右排列 */
.app-layout {
  display: flex;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg-page);
}

/* 左侧文件列表 */
.sidebar {
  width: 264px;
  min-width: 264px;
  border-right: 1px solid var(--border);
  background: var(--bg-subtle);
  overflow-y: auto;
  flex-shrink: 0;
}

.sidebar-scrim {
  display: none;
}

/* 右侧编辑器（flex: 1 填满剩余空间） */
.editor-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 2500;
    width: min(86vw, 320px);
    min-width: 0;
    transform: translateX(-105%);
    transition: transform 0.22s cubic-bezier(0.32, 0.72, 0, 1);
    box-shadow: var(--shadow-xl);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 2400;
    background: rgba(10, 10, 16, 0.4);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }
}

/* 登录弹窗 */
.auth-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 16, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 16px;
}

.auth-modal-content {
  position: relative;
  background: var(--bg-panel);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-xl);
  max-width: 420px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.auth-modal-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-sub);
  z-index: 10;
}

.auth-modal-close:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}

.auth-loading {
  padding: 2rem;
  text-align: center;
  color: var(--text-sub);
}

/* 弹窗内表单样式 */
.auth-modal-content .auth-page {
  min-height: auto;
  padding: 0;
}

.auth-modal-content .auth-card {
  border: none;
  box-shadow: none;
  padding: 2rem;
  background: transparent;
}
</style>
