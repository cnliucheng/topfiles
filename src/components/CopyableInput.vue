<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ value: string }>()
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = props.value
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(ta)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  }
}

function onFocus(e: FocusEvent) {
  const t = e.target as HTMLInputElement | null
  t?.select()
}
</script>

<template>
  <div class="copyable">
    <input :value="value" readonly @focus="onFocus" />
    <button @click="copy">{{ copied ? '已复制' : '复制' }}</button>
  </div>
</template>

<style scoped>
.copyable { display: flex; gap: 0.5rem; }
.copyable input { flex: 1; padding: 0.5rem; border: 1px solid #ccc; border-radius: 6px; font-family: monospace; }
.copyable button { padding: 0.5rem 1rem; border: none; border-radius: 6px; background: var(--primary, #3b82f6); color: white; cursor: pointer; }
</style>
