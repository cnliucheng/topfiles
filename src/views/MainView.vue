<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Sidebar from '../components/Sidebar.vue'
import ShareDialog from '../components/ShareDialog.vue'
import CodeEditor from '../components/CodeEditor.vue'
import { useFilesStore } from '../stores/files'
import { inferSupportedExtension } from '../utils/file'
import type { FileExtension } from '../constants/fileTypes'

const files = useFilesStore()
const shareOpen = ref(false)
const editingContent = ref('')
const dirty = ref(false)

const filename = computed({
  get: () => files.current?.filename || '',
  set: () => {},  // 暂不允许改名（MVP）
})

const editorExt = computed<FileExtension>(() => {
  const f = files.current?.filename || ''
  return inferSupportedExtension(f) ?? 'txt'
})

watch(() => files.current?.id, () => {
  editingContent.value = files.current?.content || ''
  dirty.value = false
})

watch(editingContent, () => {
  if (files.current) dirty.value = true
})

async function save() {
  if (!files.current) return
  try {
    await files.update(files.current.id, { content: editingContent.value })
    dirty.value = false
  } catch (e: any) {
    alert(e.response?.data?.error?.message || '保存失败')
  }
}

function openShare() {
  if (!files.current) {
    alert('请先选择或创建一个文件')
    return
  }
  shareOpen.value = true
}
</script>

<template>
  <div class="main">
    <Sidebar />
    <main class="editor-area">
      <div v-if="!files.current" class="empty">
        <p>从左侧选择或新建一个文件</p>
      </div>
      <template v-else>
        <div class="toolbar">
          <input class="filename" :value="filename" readonly />
          <span v-if="dirty" class="dirty">● 未保存</span>
          <button @click="save" :disabled="!dirty">保存</button>
          <button @click="openShare">分享</button>
        </div>
        <div class="editor-wrap">
          <CodeEditor
            v-model="editingContent"
            :ext="editorExt"
            :font-size="14"
          />
        </div>
      </template>
    </main>
    <ShareDialog v-model:open="shareOpen" :filename="files.current?.filename ?? null" />
  </div>
</template>

<style scoped>
.main { display: flex; height: 100vh; }
.editor-area { flex: 1; display: flex; flex-direction: column; }
.toolbar { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border, #ddd); display: flex; gap: 0.5rem; align-items: center; }
.filename { padding: 0.4rem 0.6rem; border: 1px solid #ccc; border-radius: 4px; flex: 1; max-width: 300px; }
.dirty { color: #f59e0b; font-size: 0.85rem; }
.toolbar button { padding: 0.4rem 1rem; border: none; background: var(--primary, #3b82f6); color: white; border-radius: 4px; cursor: pointer; }
.toolbar button:disabled { opacity: 0.5; cursor: not-allowed; }
.editor-wrap { flex: 1; overflow: hidden; }
.editor-wrap > :deep(*) { height: 100%; }
.empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #888; }
</style>
