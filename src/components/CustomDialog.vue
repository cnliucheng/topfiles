<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDialogStore } from '../stores/dialog'

const dialog = useDialogStore()
const promptValue = ref('')

watch(() => dialog.state.visible, (visible) => {
  if (visible && dialog.state.type === 'prompt') {
    promptValue.value = dialog.state.defaultValue
  }
})

function onConfirm() {
  if (dialog.state.type === 'prompt') {
    dialog.close(promptValue.value || null)
  } else {
    dialog.close(true)
  }
}

function onCancel() {
  dialog.close(false)
}
</script>

<template>
  <div v-if="dialog.state.visible" class="dialog-overlay" @click.self="onCancel">
    <div class="dialog-box">
      <div class="dialog-header">
        <h3>{{ dialog.state.title }}</h3>
      </div>
      <div class="dialog-body">
        <p>{{ dialog.state.message }}</p>
        <input
          v-if="dialog.state.type === 'prompt'"
          v-model="promptValue"
          class="dialog-input"
          type="text"
          @keydown.enter="onConfirm"
          @keydown.escape="onCancel"
        />
      </div>
      <div class="dialog-footer">
        <button
          v-if="dialog.state.type !== 'alert'"
          class="dialog-btn dialog-btn-cancel"
          @click="onCancel"
        >取消</button>
        <button class="dialog-btn dialog-btn-ok" @click="onConfirm">确定</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 16, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  padding: 16px;
}
.dialog-box {
  background: var(--bg-panel);
  color: var(--text-main);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  max-width: 420px;
  width: 100%;
  overflow: hidden;
}
.dialog-header {
  padding: 18px 20px 6px;
}
.dialog-header h3 {
  margin: 0;
  font-size: 15.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.dialog-body {
  padding: 6px 20px 16px;
}
.dialog-body p {
  margin: 0 0 12px;
  color: var(--text-sub);
  font-size: 13.5px;
  line-height: 1.55;
}
.dialog-input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  color: var(--text-main);
  font-size: 14px;
  box-sizing: border-box;
}
.dialog-input:hover {
  border-color: var(--primary);
}
.dialog-input:focus {
  border-color: var(--primary);
  outline: none;
  box-shadow: 0 0 0 3px var(--ring);
}
/* Chrome autofill */
.dialog-input:-webkit-autofill,
.dialog-input:-webkit-autofill:hover,
.dialog-input:-webkit-autofill:focus,
.dialog-input:-webkit-autofill:active {
  -webkit-box-shadow: 0 0 0 30px var(--bg-panel) inset !important;
  -webkit-text-fill-color: var(--text-main) !important;
  caret-color: var(--text-main);
  transition: background-color 9999s ease-in-out 0s;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}
.dialog-btn {
  height: 34px;
  padding: 0 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background-color 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s;
}
.dialog-btn-ok {
  background: var(--primary);
  color: white;
  box-shadow: var(--shadow-sm);
}
.dialog-btn-ok:hover {
  background: var(--primary-hover);
}
.dialog-btn-cancel {
  background: transparent;
  color: var(--text-main);
  border: 1px solid var(--border-strong);
  font-weight: 550;
}
.dialog-btn-cancel:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary-text);
}
</style>
