<script setup lang="ts">
import { computed } from 'vue'
import CopyableInput from './CopyableInput.vue'

const props = defineProps<{ open: boolean; filename: string | null }>()
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>()

const shareUrl = computed(() => {
  if (!props.filename) return ''
  return `${window.location.origin}/u/${encodeURIComponent(props.filename)}`
})

function close() { emit('update:open', false) }
</script>

<template>
  <div v-if="open" class="overlay" @click.self="close">
    <div class="modal">
      <h2>分享文件</h2>
      <p>任何人可通过以下链接访问：</p>
      <CopyableInput :value="shareUrl" />
      <p class="hint">提示：TopFiles 默认所有文件可分享。请勿分享敏感内容。</p>
      <button @click="close" class="close-btn">关闭</button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 16, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.modal {
  background: var(--bg-panel);
  color: var(--text-main);
  padding: 24px;
  border-radius: var(--radius-xl);
  max-width: 500px;
  width: 100%;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-xl);
}
.modal h2 { margin: 0 0 8px; font-size: 16px; font-weight: 650; letter-spacing: -0.01em; }
.modal p { margin: 0 0 0.75rem; font-size: 13px; color: var(--text-sub); }
.hint { color: var(--text-faint); font-size: 12px; margin-top: 1rem; }
.close-btn {
  margin-top: 1.25rem;
  height: 34px;
  padding: 0 16px;
  border: 1px solid var(--border-strong);
  background: var(--bg-panel);
  color: var(--text-main);
  font-size: 13px;
  font-weight: 550;
  border-radius: var(--radius-md);
  cursor: pointer;
}
.close-btn:hover { background: var(--primary-soft); border-color: var(--primary); color: var(--primary-text); }
</style>
