<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useI18n } from 'vue-i18n'
import { IconFileText } from '@tabler/icons-vue'

const emit = defineEmits<{ (e: 'success'): void }>()
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
    emit('success')
  } catch (e: any) {
    error.value = e.response?.data?.error?.message || t('auth.loginFailed', '登录失败')
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
          <IconFileText :size="18" :stroke-width="1.8" />
        </span>
        <h1>TopFiles</h1>
      </div>
      <p class="auth-hint">{{ t('auth.pleaseLogin', '请登录') }}</p>
      <form @submit.prevent="onSubmit">
        <label>
          <span>{{ t('auth.username', '用户名') }}</span>
          <input v-model="username" type="text" autocomplete="username" />
        </label>
        <label>
          <span>{{ t('auth.password', '密码') }}</span>
          <input v-model="password" type="password" autocomplete="current-password" />
        </label>
        <p v-if="error" class="auth-err auth-err-banner">{{ error }}</p>
        <button type="submit" :disabled="!canSubmit">
          {{ submitting ? t('auth.submitting', '登录中...') : t('auth.login', '登录') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* 所有样式由全局 style.css 的 .auth-card 体系提供 */
</style>
