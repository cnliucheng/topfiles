<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ value: string }>()
const copied = ref(false)
const { t } = useI18n()

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = props.value
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { await navigator.clipboard.writeText(props.value) } catch {}
    document.body.removeChild(ta)
  }
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

function onFocus(e: FocusEvent) {
  const t = e.target as HTMLInputElement | null
  t?.select()
}
</script>

<template>
  <div class="copyable">
    <input :value="value" readonly @focus="onFocus" />
    <button @click="copy">{{ copied ? t('copied') : t('copy') }}</button>
  </div>
</template>

<style scoped>
.copyable { display: flex; gap: var(--space-2); }
.copyable input {
  flex: 1;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-family: Menlo, Monaco, Consolas, monospace;
  font-size: 12.5px;
  background: var(--bg-subtle);
  color: var(--text-main);
}
.copyable input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
.copyable button {
  height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--primary);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}
.copyable button:hover { background: var(--primary-hover); }
</style>
