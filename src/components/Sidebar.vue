<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useFilesStore } from '../stores/files'
import { useAuthStore } from '../stores/auth'
import { useDialogStore } from '../stores/dialog'
import { api } from '../api/client'
import ShareDialog from './ShareDialog.vue'

const files = useFilesStore()
const auth = useAuthStore()
const dialog = useDialogStore()
const shareOpen = ref(false)

// 修改密码
const accountOpen = ref(false)
const accountForm = ref({ currentPassword: '', newUsername: '', newPassword: '' })
const accountSubmitting = ref(false)
const accountError = ref<string | null>(null)

function openAccount() {
  accountForm.value = { currentPassword: '', newUsername: '', newPassword: '' }
  accountError.value = null
  accountOpen.value = true
}

async function saveAccount() {
  if (!accountForm.value.currentPassword) {
    accountError.value = '请输入当前密码'
    return
  }
  if (!accountForm.value.newUsername && !accountForm.value.newPassword) {
    accountError.value = '请至少填写一个新用户名或新密码'
    return
  }
  accountSubmitting.value = true
  accountError.value = null
  try {
    const res = await api.put<{ username: string }>('/api/auth/account', accountForm.value)
    auth.user = { username: res.data.username }
    accountOpen.value = false
    await dialog.alert('账号信息已更新', '修改成功')
  } catch (e: any) {
    accountError.value = e.response?.data?.error?.message || '修改失败'
  } finally {
    accountSubmitting.value = false
  }
}

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
  const filename = await dialog.prompt('输入文件名', 'untitled.md', '新建文件')
  if (!filename) return
  try {
    await files.create({ filename, content: '' })
  } catch (e: any) {
    await dialog.alert(e.response?.data?.error?.message || '创建失败', '错误')
  }
}

async function loadFile(id: number) {
  await files.loadFile(id)
}

async function removeFile(id: number, event: Event) {
  event.stopPropagation()
  const ok = await dialog.confirm('确定删除？', '删除文件')
  if (!ok) return
  try {
    await files.remove(id)
  } catch (e: any) {
    await dialog.alert(e.response?.data?.error?.message || '删除失败', '错误')
  }
}

async function onLogout() {
  const ok = await dialog.confirm('确定注销？', '退出登录')
  if (!ok) return
  await auth.logout()
}

function openShare() {
  if (!files.current) {
    dialog.alert('请先选择或新建一个文件', '提示')
    return
  }
  shareOpen.value = true
}
</script>

<template>
  <div class="sidebar-inner">
    <!-- 用户信息 -->
    <div class="sidebar-header">
      <span class="user-avatar">👤</span>
      <span class="user-name">{{ auth.user?.username }}</span>
    </div>

    <!-- 操作按钮 -->
    <div class="sidebar-actions">
      <button @click="newFile" class="sidebar-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <path d="M12 5V19" stroke-linecap="round"/>
          <path d="M5 12H19" stroke-linecap="round"/>
        </svg>
        <span>新建</span>
      </button>
      <button @click="openShare" class="sidebar-btn" :disabled="!files.current">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <path d="M4 12V20C4 20.5523 4.44772 21 5 21H19C19.5523 21 20 20.5523 20 20V12" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16 6L12 2L8 6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 2V15" stroke-linecap="round"/>
        </svg>
        <span>分享</span>
      </button>
    </div>

    <!-- 文件列表 -->
    <div class="sidebar-content">
      <ul class="file-list">
        <li v-if="files.loading" class="empty-state">加载中...</li>
        <li v-else-if="files.list.length === 0" class="empty-state">
          <span class="empty-icon">📁</span>
          <span>还没有文件</span>
        </li>
        <li
          v-for="f in files.list"
          :key="f.id"
          class="file-item"
          :class="{ active: files.current?.id === f.id }"
          @click="loadFile(f.id)"
        >
          <span class="file-icon">📄</span>
          <span class="file-name">{{ f.filename }}</span>
          <span class="file-size">{{ formatSize(f.sizeBytes) }}</span>
          <button class="file-delete" @click="removeFile(f.id, $event)" title="删除">×</button>
        </li>
      </ul>
    </div>

    <!-- 底部退出按钮 -->
    <div class="sidebar-footer">
      <button @click="openAccount" class="logout-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15C18.3 16.8 16.3 18 14 18C10.7 18 8 15.3 8 12C8 8.7 10.7 6 14 6C16.3 6 18.3 7.2 19.4 9" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>修改密码</span>
      </button>
      <button @click="onLogout" class="logout-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <path d="M9 21H5C4.44772 21 4 20.5523 4 20V4C4 3.44772 4.44772 3 5 3H9" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16 17L21 12L16 7" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M21 12H9" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>退出登录</span>
      </button>
    </div>

    <!-- 修改密码弹窗 -->
    <div v-if="accountOpen" class="account-overlay" @click.self="accountOpen = false">
      <div class="account-modal">
        <h4>修改账号信息</h4>
        <label>
          <span>当前密码</span>
          <input v-model="accountForm.currentPassword" type="password" placeholder="必填" />
        </label>
        <label>
          <span>新用户名（留空不修改）</span>
          <input v-model="accountForm.newUsername" type="text" placeholder="3-32 位字母数字 _ -" />
        </label>
        <label>
          <span>新密码（留空不修改）</span>
          <input v-model="accountForm.newPassword" type="password" placeholder="至少 8 位" />
        </label>
        <p v-if="accountError" class="account-error">{{ accountError }}</p>
        <div class="account-actions">
          <button @click="accountOpen = false" class="sidebar-btn">取消</button>
          <button @click="saveAccount" class="sidebar-btn" :disabled="accountSubmitting"
            style="background: var(--primary); color: white; border-color: var(--primary);">
            {{ accountSubmitting ? '保存中...' : '保存修改' }}
          </button>
        </div>
      </div>
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
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  font-size: 14px;
}

.user-avatar {
  font-size: 18px;
}

.user-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-actions {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.sidebar-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
  color: var(--text-main);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.sidebar-btn:hover {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary-text);
}

.sidebar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sidebar-btn:disabled:hover {
  border-color: var(--border);
  background: var(--bg-panel);
  color: var(--text-main);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
}

.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background 0.1s;
}

.file-item:hover {
  background: var(--primary-soft);
}

.file-item.active {
  background: var(--primary-soft);
  border-left: 3px solid var(--primary);
}

.file-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.file-size {
  font-size: 11px;
  color: var(--text-sub);
  flex-shrink: 0;
}

.file-delete {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--text-sub);
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
}

.file-item:hover .file-delete {
  opacity: 1;
}

.file-delete:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  color: var(--text-sub);
  font-size: 13px;
}

.empty-icon {
  font-size: 32px;
  opacity: 0.5;
}

.sidebar-footer {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--border);
}

.logout-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 6px;
  white-space: nowrap;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
  color: var(--text-sub);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
  overflow: hidden;
  text-overflow: ellipsis;
}

.logout-btn:hover {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* 修改密码弹窗 */
.account-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}
.account-modal {
  background: var(--bg-card);
  color: var(--text-main);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
.account-modal h4 {
  margin: 0 0 16px;
  font-size: 16px;
}
.account-modal label {
  display: block;
  margin-bottom: 12px;
}
.account-modal label > span {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  color: var(--text-sub);
}
.account-modal input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
  color: var(--text-main);
  font-size: 14px;
  box-sizing: border-box;
}
.account-modal input:focus {
  border-color: var(--primary);
  outline: none;
}
.account-error {
  color: #ef4444;
  font-size: 13px;
  margin: 4px 0 12px;
}
.account-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  justify-content: flex-end;
}
.account-actions .sidebar-btn {
  width: auto;
  flex: none;
  padding: 8px 20px;
}
</style>
