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
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}
.dialog-box {
  background: var(--bg-card);
  color: var(--text-main);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-width: 420px;
  width: 90%;
  overflow: hidden;
}
.dialog-header {
  padding: 16px 20px 8px;
}
.dialog-header h3 {
  margin: 0;
  font-size: 16px;
}
.dialog-body {
  padding: 8px 20px 16px;
}
.dialog-body p {
  margin: 0 0 12px;
  color: var(--text-sub);
  font-size: 14px;
  line-height: 1.5;
}
.dialog-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
  color: var(--text-main);
  font-size: 14px;
  box-sizing: border-box;
}
.dialog-input:focus {
  border-color: var(--primary);
  outline: none;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}
.dialog-btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}
.dialog-btn-ok {
  background: var(--primary);
  color: white;
}
.dialog-btn-ok:hover {
  background: var(--primary-hover);
}
.dialog-btn-cancel {
  background: transparent;
  color: var(--text-sub);
  border: 1px solid var(--border);
}
.dialog-btn-cancel:hover {
  background: var(--primary-soft);
  color: var(--primary-text);
}
</style>
