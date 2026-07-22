import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 全局 UI 状态：登录弹窗、移动端侧栏开关
 * 供 App.vue（弹窗宿主）与 LegacyEditor（顶栏触发）跨组件共享
 */
export const useUiStore = defineStore('ui', () => {
  const authModalOpen = ref(false)
  const sidebarOpen = ref(false)

  function openAuthModal(): void {
    authModalOpen.value = true
  }

  function closeAuthModal(): void {
    authModalOpen.value = false
  }

  return { authModalOpen, sidebarOpen, openAuthModal, closeAuthModal }
})
