import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, onAuthExpired } from '../api/client'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ username: string } | null>(null)
  const isInitialized = ref<boolean | null>(null)  // null = 还没检查

  async function init() {
    try {
      const status = await api.get<{ hasAccount: boolean }>('/api/setup/status')
      isInitialized.value = status.data.hasAccount
      if (status.data.hasAccount) {
        try {
          const me = await api.get<{ username: string }>('/api/auth/me')
          user.value = me.data
        } catch {
          user.value = null
        }
      }
    } catch {
      isInitialized.value = false
    }
  }

  async function setup(username: string, password: string) {
    await api.post('/api/auth/setup', { username, password })
    isInitialized.value = true
    user.value = { username }
  }

  async function login(username: string, password: string) {
    const res = await api.post<{ username: string }>('/api/auth/login', { username, password })
    user.value = res.data
  }

  async function logout() {
    await api.post('/api/auth/logout')
    user.value = null
  }

  function reset() {
    user.value = null
  }

  // 注册全局 401 监听
  onAuthExpired(() => {
    if (user.value) {
      user.value = null
    }
  })

  const isLoggedIn = computed(() => !!user.value)

  return { user, isInitialized, isLoggedIn, init, setup, login, logout, reset }
})