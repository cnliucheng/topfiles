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
    <div class="auth-card">
      <div class="auth-logo">
        <span class="brand-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.5 3H7.5C6.4 3 5.5 3.9 5.5 5V19C5.5 20.1 6.4 21 7.5 21H16.5C17.6 21 18.5 20.1 18.5 19V8L13.5 3Z" fill="white" fill-opacity="0.95" />
            <path d="M13.5 3V7.2C13.5 7.64 13.86 8 14.3 8H18.5L13.5 3Z" fill="#c9c4ff" />
            <path d="M8.5 12.5H15.5" stroke="#5147e8" stroke-width="1.4" stroke-linecap="round" />
            <path d="M8.5 15.5H13.5" stroke="#5147e8" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </span>
        <h1>TopFiles</h1>
      </div>
      <p class="auth-hint">{{ t('setup.welcome', '欢迎使用，请创建账号（仅一次）') }}</p>
      <form @submit.prevent="onSubmit">
        <label>
          <span>{{ t('auth.username', '用户名') }}</span>
          <input v-model="username" type="text" autocomplete="username" :placeholder="t('auth.usernamePlaceholder', '3-32 位字母数字 _ -')" />
        </label>
        <p v-if="username && !usernameValid" class="auth-err">{{ t('auth.usernameInvalid', '格式：3-32 位，字母数字 _ -') }}</p>

        <label>
          <span>{{ t('auth.password', '密码') }}</span>
          <input v-model="password" type="password" autocomplete="new-password" :placeholder="t('auth.passwordPlaceholder', '至少 8 位')" />
        </label>
        <p v-if="password && !passwordValid" class="auth-err">{{ t('auth.passwordShort', '密码至少 8 位') }}</p>

        <label>
          <span>{{ t('auth.confirmPassword', '确认密码') }}</span>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" />
        </label>
        <p v-if="confirmPassword && !match" class="auth-err">{{ t('auth.passwordMismatch', '两次密码不一致') }}</p>

        <p v-if="error" class="auth-err auth-err-banner">{{ error }}</p>

        <button type="submit" :disabled="!canSubmit">
          {{ submitting ? t('auth.submitting', '创建中...') : t('auth.createAccount', '创建账号') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* 所有样式由全局 style.css 的 .auth-card 体系提供 */
</style>
