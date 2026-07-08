<script setup lang="ts">
import { onMounted } from 'vue'
import { useFilesStore } from '../stores/files'
import { useAuthStore } from '../stores/auth'

const files = useFilesStore()
const auth = useAuthStore()

onMounted(() => {
  if (auth.isLoggedIn) {
    files.fetchList()
  }
})

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function newFile() {
  const filename = prompt('输入文件名（如 notes.md）', 'untitled.md')
  if (!filename) return
  try {
    await files.create({ filename, content: '' })
  } catch (e: any) {
    alert(e.response?.data?.error?.message || '创建失败')
  }
}

async function loadFile(id: number) {
  await files.loadFile(id)
}

async function removeFile(id: number, event: Event) {
  event.stopPropagation()
  if (!confirm('确定删除？')) return
  try {
    await files.remove(id)
  } catch (e: any) {
    alert(e.response?.data?.error?.message || '删除失败')
  }
}

async function onLogout() {
  if (!confirm('确定注销？')) return
  await auth.logout()
}
</script>

<template>
  <aside class="sidebar">
    <div class="header">
      <span class="user">{{ auth.user?.username }}</span>
    </div>
    <button @click="newFile" class="new-btn">+ 新建</button>
    <ul class="file-list">
      <li v-if="files.loading" class="empty">加载中...</li>
      <li v-else-if="files.list.length === 0" class="empty">还没有文件</li>
      <li
        v-for="f in files.list"
        :key="f.id"
        :class="{ active: files.current?.id === f.id }"
        @click="loadFile(f.id)"
      >
        <span class="name">📄 {{ f.filename }}</span>
        <span class="meta">{{ formatSize(f.sizeBytes) }}</span>
        <button class="del" @click="removeFile(f.id, $event)">×</button>
      </li>
    </ul>
    <div class="footer">
      <button @click="onLogout" class="logout">⚙️ 注销</button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 240px;
  border-right: 1px solid var(--border, #ddd);
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
}
.header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border, #eee); font-weight: 600; }
.new-btn { margin: 0.75rem; padding: 0.5rem; border: 1px dashed #ccc; background: transparent; border-radius: 6px; cursor: pointer; }
.file-list { list-style: none; margin: 0; padding: 0; flex: 1; overflow-y: auto; }
.file-list li { padding: 0.5rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid #f5f5f5; }
.file-list li:hover { background: var(--hover, #f5f5f5); }
.file-list li.active { background: var(--active, #e0e7ff); }
.file-list .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-list .meta { font-size: 0.75rem; color: #888; }
.file-list .del { background: transparent; border: none; color: #999; cursor: pointer; padding: 0 0.25rem; }
.file-list .del:hover { color: #c33; }
.empty { color: #999; padding: 1rem; text-align: center; font-size: 0.9rem; }
.footer { padding: 0.75rem; border-top: 1px solid var(--border, #eee); }
.logout { width: 100%; padding: 0.5rem; border: 1px solid #ccc; background: transparent; border-radius: 6px; cursor: pointer; }
</style>
