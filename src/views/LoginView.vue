<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useI18n } from 'vue-i18n'

const auth = useAuthStore()
const { t } = useI18n()

const username = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

const canSubmit = computed(() => username.value && password.value && !submitting.value)

async function onSubmit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = null
  try {
    await auth.login(username.value, password.value)
  } catch (e: any) {
    error.value = e.response?.data?.error?.message || t('auth.loginFailed', '登录失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="card">
      <h1>TopFiles</h1>
      <p class="hint">{{ t('auth.pleaseLogin', '请登录') }}</p>
      <form @submit.prevent="onSubmit">
        <label>
          <span>{{ t('auth.username', '用户名') }}</span>
          <input v-model="username" type="text" autocomplete="username" />
        </label>
        <label>
          <span>{{ t('auth.password', '密码') }}</span>
          <input v-model="password" type="password" autocomplete="current-password" />
        </label>
        <p v-if="error" class="err err-banner">{{ error }}</p>
        <button type="submit" :disabled="!canSubmit">
          {{ submitting ? t('auth.submitting', '登录中...') : t('auth.login', '登录') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
.card { width: 100%; max-width: 380px; padding: 2rem; border: 1px solid var(--border, #ddd); border-radius: 12px; }
h1 { margin: 0 0 0.5rem; }
.hint { color: #666; margin-bottom: 1.5rem; font-size: 0.9rem; }
label { display: block; margin-bottom: 0.75rem; }
label > span { display: block; margin-bottom: 0.25rem; font-size: 0.9rem; }
input { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; }
.err { color: #c33; font-size: 0.8rem; }
.err-banner { padding: 0.5rem; background: #fee; border-radius: 4px; margin-top: 0.5rem; }
button { width: 100%; padding: 0.75rem; margin-top: 1rem; border: none; border-radius: 6px; background: var(--primary, #3b82f6); color: white; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
