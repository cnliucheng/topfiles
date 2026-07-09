<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ (e: 'success'): void }>()
const auth = useAuthStore()
const { t } = useI18n()

const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

const usernameValid = computed(() => /^[a-z0-9_-]{3,32}$/i.test(username.value))
const passwordValid = computed(() => password.value.length >= 8)
const match = computed(() => password.value === confirmPassword.value)
const canSubmit = computed(() => usernameValid.value && passwordValid.value && match.value && !submitting.value)

async function onSubmit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = null
  try {
    await auth.setup(username.value, password.value)
    emit('success')
  } catch (e: any) {
    error.value = e.response?.data?.error?.message || e.message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="card">
      <h1>TopFiles</h1>
      <p class="hint">{{ t('setup.welcome', '欢迎使用，请创建账号（仅一次）') }}</p>
      <form @submit.prevent="onSubmit">
        <label>
          <span>{{ t('auth.username', '用户名') }}</span>
          <input v-model="username" type="text" autocomplete="username" :placeholder="t('auth.usernamePlaceholder', '3-32 位字母数字 _ -')" />
        </label>
        <p v-if="username && !usernameValid" class="err">{{ t('auth.usernameInvalid', '格式：3-32 位，字母数字 _ -') }}</p>

        <label>
          <span>{{ t('auth.password', '密码') }}</span>
          <input v-model="password" type="password" autocomplete="new-password" :placeholder="t('auth.passwordPlaceholder', '至少 8 位')" />
        </label>
        <p v-if="password && !passwordValid" class="err">{{ t('auth.passwordShort', '密码至少 8 位') }}</p>

        <label>
          <span>{{ t('auth.confirmPassword', '确认密码') }}</span>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" />
        </label>
        <p v-if="confirmPassword && !match" class="err">{{ t('auth.passwordMismatch', '两次密码不一致') }}</p>

        <p v-if="error" class="err err-banner">{{ error }}</p>

        <button type="submit" :disabled="!canSubmit">
          {{ submitting ? t('auth.submitting', '创建中...') : t('auth.createAccount', '创建账号') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
.card { width: 100%; max-width: 380px; padding: 2rem; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-card); color: var(--text-main); }
h1 { margin: 0 0 0.5rem; }
.hint { color: var(--text-sub); margin-bottom: 1.5rem; font-size: 0.9rem; }
label { display: block; margin-bottom: 0.5rem; }
label > span { display: block; margin-bottom: 0.25rem; font-size: 0.9rem; color: var(--text-sub); }
input { width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 6px; box-sizing: border-box; background: var(--bg-panel); color: var(--text-main); }
input:focus { border-color: var(--primary); outline: none; }
.err { color: #ef4444; font-size: 0.8rem; margin: 0.25rem 0 0.5rem; }
.err-banner { padding: 0.5rem; background: rgba(239, 68, 68, 0.1); border-radius: 4px; }
button { width: 100%; padding: 0.75rem; margin-top: 1rem; border: none; border-radius: 6px; background: var(--primary); color: white; cursor: pointer; }
button:hover { background: var(--primary-hover); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>