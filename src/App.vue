<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
import SetupView from './views/SetupView.vue'
import LoginView from './views/LoginView.vue'
import MainView from './views/MainView.vue'

const auth = useAuthStore()

onMounted(() => {
  auth.init()
})
</script>

<template>
  <SetupView v-if="auth.isInitialized === false" />
  <LoginView v-else-if="!auth.isLoggedIn" />
  <MainView v-else />
</template>
