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
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal { background: var(--bg-card, white); color: var(--text-main); padding: 2rem; border-radius: 12px; max-width: 500px; width: 90%; border: 1px solid var(--border); }
.modal h2 { margin: 0 0 1rem; }
.modal p { margin: 0 0 0.75rem; }
.hint { color: var(--text-sub, #888); font-size: 0.85rem; margin-top: 1rem; }
.close-btn { margin-top: 1rem; padding: 0.5rem 1rem; border: 1px solid var(--border); background: transparent; color: var(--text-main); border-radius: 6px; cursor: pointer; }
.close-btn:hover { background: var(--primary-soft); border-color: var(--primary); color: var(--primary-text); }
</style>
