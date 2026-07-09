<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useFilesStore } from '../stores/files'
import { useAuthStore } from '../stores/auth'
import ShareDialog from './ShareDialog.vue'

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

// 分享功能
const shareOpen = ref(false)

function openShare() {
  if (!files.current) {
    alert('请先选择或新建一个文件')
    return
  }
  shareOpen.value = true
}
</script>

<template>
  <div class="sidebar-inner">
    <div class="header">
      <span class="user">👤 {{ auth.user?.username }}</span>
    </div>

    <div class="actions">
      <button @click="newFile" class="new-btn">+ 新建</button>
      <button @click="openShare" class="share-btn" :disabled="!files.current">🔗 分享</button>
    </div>

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
        <button class="del" @click="removeFile(f.id, $event)" title="删除">×</button>
      </li>
    </ul>

    <div class="footer">
      <button @click="onLogout" class="logout">🚪 退出登录</button>
    </div>
  </div>

  <ShareDialog v-model:open="shareOpen" :filename="files.current?.filename ?? null" />
</template>

<style scoped>
.sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}
.header {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border, #eee);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.actions {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--border, #f0f0f0);
}
.new-btn, .share-btn {
  flex: 1;
  padding: 0.5rem;
  border: 1px dashed #ccc;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}
.share-btn {
  border-style: solid;
}
.share-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  overflow-y: auto;
}
.file-list li {
  padding: 0.5rem 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid #f5f5f5;
}
.file-list li:hover {
  background: var(--hover, #f5f5f5);
}
.file-list li.active {
  background: var(--active, #e0e7ff);
}
.file-list .name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-list .meta {
  font-size: 0.75rem;
  color: #888;
}
.file-list .del {
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 0 0.25rem;
  font-size: 14px;
}
.file-list .del:hover {
  color: #c33;
}
.empty {
  color: #999;
  padding: 1rem;
  text-align: center;
  font-size: 0.9rem;
}
.footer {
  padding: 0.75rem;
  border-top: 1px solid var(--border, #eee);
}
.logout {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
}
</style>
