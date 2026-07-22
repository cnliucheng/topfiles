<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFilesStore } from '../stores/files'
import { useAuthStore } from '../stores/auth'
import { useDialogStore } from '../stores/dialog'
import { api } from '../api/client'
import ShareDialog from './ShareDialog.vue'

const { t } = useI18n()
const files = useFilesStore()
const auth = useAuthStore()
const dialog = useDialogStore()
const shareOpen = ref(false)
const emit = defineEmits<{ (e: 'close-mobile'): void }>()

const searchQuery = ref('')
type SortKey = 'updated' | 'name' | 'size'
const sortKey = ref<SortKey>('updated')

const batchMode = ref(false)
const selectedIds = ref<Set<number>>(new Set())

const filteredList = computed(() => {
  let result = [...files.list]
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    result = result.filter(f => f.filename.toLowerCase().includes(q))
  }
  switch (sortKey.value) {
    case 'name':
      result.sort((a, b) => a.filename.localeCompare(b.filename))
      break
    case 'size':
      result.sort((a, b) => b.sizeBytes - a.sizeBytes)
      break
    case 'updated':
    default:
      result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      break
  }
  return result
})

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  if (!batchMode.value) {
    selectedIds.value.clear()
  }
}

function toggleSelect(id: number) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
}

function selectAll() {
  if (selectedIds.value.size === filteredList.value.length) {
    selectedIds.value.clear()
  } else {
    filteredList.value.forEach(f => selectedIds.value.add(f.id))
  }
}

async function deleteSelected() {
  const count = selectedIds.value.size
  if (count === 0) return
  const ok = await dialog.confirm(t('confirmDeleteSelected', { count }), t('deleteFileTitle'))
  if (!ok) return
  const ids = [...selectedIds.value]
  for (const id of ids) {
    try {
      await files.remove(id)
      selectedIds.value.delete(id)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } }
      await dialog.alert(err.response?.data?.error?.message || t('deleteFailed'), t('error'))
    }
  }
  if (selectedIds.value.size === 0) {
    batchMode.value = false
  }
}

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
    accountError.value = t('accountCurrentPasswordRequired')
    return
  }
  if (!accountForm.value.newUsername && !accountForm.value.newPassword) {
    accountError.value = t('accountNothingChanged')
    return
  }
  accountSubmitting.value = true
  accountError.value = null
  try {
    const res = await api.put<{ username: string }>('/api/auth/account', accountForm.value)
    auth.user = { username: res.data.username }
    accountOpen.value = false
    await dialog.alert(t('accountUpdated'), t('success'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } }
    accountError.value = err.response?.data?.error?.message || t('accountSaveFailed')
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
  const filename = await dialog.prompt(t('enterFilename'), 'untitled.md', t('newFileTitle'))
  if (!filename) return
  try {
    await files.create({ filename, content: '' })
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } }
    await dialog.alert(err.response?.data?.error?.message || t('createFailed'), t('error'))
  }
}

async function loadFile(id: number) {
  if (batchMode.value) {
    toggleSelect(id)
    return
  }
  await files.loadFile(id)
  emit('close-mobile')
}

async function removeFile(id: number, event: Event) {
  event.stopPropagation()
  const ok = await dialog.confirm(t('confirmDelete'), t('deleteFileTitle'))
  if (!ok) return
  try {
    await files.remove(id)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } }
    await dialog.alert(err.response?.data?.error?.message || t('deleteFailed'), t('error'))
  }
}

async function onLogout() {
  const ok = await dialog.confirm(t('confirmLogout'), t('logoutTitle'))
  if (!ok) return
  try {
    await auth.logout()
    files.clearAll()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } }
    await dialog.alert(err.response?.data?.error?.message || t('logoutFailed'), t('error'))
  }
}

function openShare() {
  if (!files.current) {
    dialog.alert(t('selectFileFirst'), t('hint'))
    return
  }
  shareOpen.value = true
}
</script>

<template>
  <div class="sidebar-inner">
    <div class="sidebar-header">
      <span class="user-avatar" aria-hidden="true">{{ (auth.user?.username ?? '?').slice(0, 1).toUpperCase() }}</span>
      <span class="user-name">{{ auth.user?.username }}</span>
      <button class="mobile-close" :aria-label="t('closeFileList')" @click="emit('close-mobile')">×</button>
    </div>

    <div class="sidebar-section-title">
      <span>{{ t('files') }}</span>
      <div class="section-right">
        <span v-if="batchMode">{{ selectedIds.size }}</span>
        <span v-else>{{ files.list.length }}</span>
      </div>
    </div>

    <div class="sidebar-actions">
      <button @click="newFile" class="sidebar-btn sidebar-btn-primary">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <path d="M12 5V19" stroke-linecap="round"/>
          <path d="M5 12H19" stroke-linecap="round"/>
        </svg>
        <span>{{ t('newFile') }}</span>
      </button>
      <button @click="openShare" class="sidebar-btn" :disabled="!files.current">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <path d="M4 12V20C4 20.5523 4.44772 21 5 21H19C19.5523 21 20 20.5523 20 20V12" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16 6L12 2L8 6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 2V15" stroke-linecap="round"/>
        </svg>
        <span>{{ t('share') }}</span>
      </button>
    </div>

    <div v-if="files.list.length > 0" class="sidebar-toolbar">
      <input v-model="searchQuery" class="search-input" :placeholder="t('searchFiles')" type="text" />
      <select v-model="sortKey" class="sort-select" :aria-label="t('sortBy')">
        <option value="updated">{{ t('sortUpdated') }}</option>
        <option value="name">{{ t('sortName') }}</option>
        <option value="size">{{ t('sortSize') }}</option>
      </select>
    </div>

    <div v-if="files.list.length > 0" class="batch-bar">
      <button class="batch-toggle" @click="toggleBatchMode">
        {{ batchMode ? t('cancelSelection') : t('batchDelete') }}
      </button>
      <template v-if="batchMode">
        <button class="batch-toggle" @click="selectAll">{{ t('selectAll') }}</button>
        <button
          v-if="selectedIds.size > 0"
          class="batch-toggle batch-delete-btn"
          @click="deleteSelected"
        >{{ t('deleteSelected') }} ({{ selectedIds.size }})</button>
      </template>
    </div>

    <div class="sidebar-content">
      <ul class="file-list">
        <li v-if="files.loading" class="empty-state">{{ t('loading') }}</li>
        <li v-else-if="filteredList.length === 0" class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>{{ searchQuery ? t('searchFiles') : t('noFiles') }}</span>
        </li>
        <li
          v-for="f in filteredList"
          :key="f.id"
          class="file-item"
          :class="{ active: files.current?.id === f.id, selected: selectedIds.has(f.id) }"
          @click="loadFile(f.id)"
        >
          <input
            v-if="batchMode"
            type="checkbox"
            class="file-checkbox"
            :checked="selectedIds.has(f.id)"
            @click.stop="toggleSelect(f.id)"
          />
          <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14">
            <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="13,2 13,9 20,9" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="file-name">{{ f.filename }}</span>
          <span class="file-size">{{ formatSize(f.sizeBytes) }}</span>
          <button v-if="!batchMode" class="file-delete" @click="removeFile(f.id, $event)" :title="t('deleteFile')">×</button>
        </li>
      </ul>
    </div>

    <div class="sidebar-footer">
      <button @click="openAccount" class="logout-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15C18.3 16.8 16.3 18 14 18C10.7 18 8 15.3 8 12C8 8.7 10.7 6 14 6C16.3 6 18.3 7.2 19.4 9" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>{{ t('changePassword') }}</span>
      </button>
      <button @click="onLogout" class="logout-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
          <path d="M9 21H5C4.44772 21 4 20.5523 4 20V4C4 3.44772 4.44772 3 5 3H9" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16 17L21 12L16 7" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M21 12H9" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>{{ t('logout') }}</span>
      </button>
    </div>

    <div v-if="accountOpen" class="account-overlay" @click.self="accountOpen = false">
      <div class="account-modal">
        <h4>{{ t('accountSettings') }}</h4>
        <label>
          <span>{{ t('currentPassword') }}</span>
          <input v-model="accountForm.currentPassword" type="password" :placeholder="t('currentPasswordPlaceholder')" />
        </label>
        <label>
          <span>{{ t('newUsernameLabel') }}</span>
          <input v-model="accountForm.newUsername" type="text" :placeholder="t('newUsernamePlaceholder')" />
        </label>
        <label>
          <span>{{ t('newPasswordLabel') }}</span>
          <input v-model="accountForm.newPassword" type="password" :placeholder="t('newPasswordPlaceholder')" />
        </label>
        <p v-if="accountError" class="account-error">{{ accountError }}</p>
        <div class="account-actions">
          <button @click="accountOpen = false" class="sidebar-btn">{{ t('cancel') }}</button>
          <button @click="saveAccount" class="sidebar-btn save-btn" :disabled="accountSubmitting">
            {{ accountSubmitting ? t('saving') : t('saveChanges') }}
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
  background: var(--bg-subtle);
}

/* ---- 用户区 ---- */
.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  font-size: 13.5px;
  flex-shrink: 0;
}

.user-avatar {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-soft);
  color: var(--primary-text);
  font-size: 12px;
  font-weight: 700;
}

.user-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.01em;
}

.mobile-close {
  display: none;
  margin-left: auto;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-sub);
  font-size: 20px;
  cursor: pointer;
}
.mobile-close:hover { background: var(--bg-hover); color: var(--text-main); }

/* ---- 分区标题 ---- */
.sidebar-section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px 6px;
  color: var(--text-faint);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.section-right { font-variant-numeric: tabular-nums; }

/* ---- 操作按钮 ---- */
.sidebar-actions {
  display: flex;
  gap: 8px;
  padding: 8px 12px 12px;
}

.sidebar-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-sub);
  font-size: 12.5px;
  font-weight: 550;
  cursor: pointer;
  transition: background-color 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s;
}
.sidebar-btn:hover { background: var(--bg-hover); color: var(--text-main); }

.sidebar-btn-primary {
  background: var(--primary);
  color: #ffffff;
  box-shadow: var(--shadow-sm);
}
.sidebar-btn-primary:hover { background: var(--primary-hover); color: #ffffff; }

.sidebar-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.sidebar-btn:disabled:hover { background: transparent; color: var(--text-sub); }
.sidebar-btn-primary:disabled:hover { background: var(--primary); color: #ffffff; }

/* ---- 搜索 / 排序 ---- */
.sidebar-toolbar {
  display: flex;
  gap: 6px;
  padding: 0 12px 10px;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  color: var(--text-main);
  font-size: 12px;
}
.search-input::placeholder { color: var(--text-faint); }
.search-input:hover { border-color: var(--border-strong); }
.search-input:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px var(--ring); }

.sort-select {
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  color: var(--text-sub);
  font-size: 12px;
  cursor: pointer;
}
.sort-select:focus { border-color: var(--primary); outline: none; }

/* ---- 批量操作条 ---- */
.batch-bar {
  display: flex;
  gap: 6px;
  padding: 0 12px 10px;
  flex-wrap: wrap;
}
.batch-toggle {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-panel);
  color: var(--text-sub);
  font-size: 11px;
  font-weight: 550;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s, background-color 0.12s;
}
.batch-toggle:hover { border-color: var(--primary); color: var(--primary-text); }
.batch-delete-btn { border-color: var(--danger); color: var(--danger); }
.batch-delete-btn:hover { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }

/* ---- 文件列表 ---- */
.sidebar-content { flex: 1; overflow-y: auto; padding-bottom: 8px; }
.file-list { list-style: none; margin: 0; padding: 0 8px; }

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin: 1px 0;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color 0.1s;
}
.file-item:hover { background: var(--bg-hover); }
.file-item.active {
  background: var(--primary-soft);
  color: var(--primary-text);
}
.file-item.active .file-name { font-weight: 600; }
.file-item.active .file-size { color: var(--primary-text); opacity: 0.75; }
.file-item.selected { background: var(--primary-soft); }

.file-checkbox { flex-shrink: 0; cursor: pointer; width: 15px; height: 15px; accent-color: var(--primary); }
.file-icon { flex-shrink: 0; opacity: 0.55; }
.file-item.active .file-icon { opacity: 0.9; }
.file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.file-size { font-size: 11px; color: var(--text-faint); flex-shrink: 0; font-variant-numeric: tabular-nums; }

.file-delete {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-faint);
  font-size: 15px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.12s, color 0.12s, background-color 0.12s;
}
.file-item:hover .file-delete { opacity: 1; }
.file-delete:hover { color: var(--danger); background: var(--danger-soft); }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 32px 16px;
  color: var(--text-faint);
  font-size: 12.5px;
}
.empty-icon { opacity: 0.5; flex-shrink: 0; }

/* ---- 底部账户区 ---- */
.sidebar-footer {
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.logout-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 6px;
  white-space: nowrap;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-sub);
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  transition: background-color 0.12s, color 0.12s;
  overflow: hidden;
  text-overflow: ellipsis;
}
.logout-btn:hover { background: var(--danger-soft); color: var(--danger); }
.sidebar-footer .logout-btn:first-child:hover { background: var(--bg-hover); color: var(--text-main); }

@media (max-width: 768px) {
  .mobile-close { display: flex; align-items: center; justify-content: center; }
  .file-delete { opacity: 1; width: 36px; height: 36px; }
}

/* ---- 账户设置弹窗 ---- */
.account-overlay {
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
.account-modal {
  background: var(--bg-panel);
  color: var(--text-main);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 24px;
  max-width: 400px;
  width: 100%;
  box-shadow: var(--shadow-xl);
}
.account-modal h4 { margin: 0 0 18px; font-size: 16px; font-weight: 650; letter-spacing: -0.01em; }
.account-modal label { display: block; margin-bottom: 12px; }
.account-modal label > span { display: block; margin-bottom: 5px; font-size: 12.5px; font-weight: 550; color: var(--text-sub); }
.account-modal input {
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
.account-modal input:hover { border-color: var(--primary); }
.account-modal input:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px var(--ring); }
.account-error { color: var(--danger); font-size: 12.5px; margin: 4px 0 12px; }
.account-actions { display: flex; gap: 8px; margin-top: 18px; justify-content: flex-end; }
.account-actions .sidebar-btn { width: auto; flex: none; padding: 0 16px; height: 34px; border: 1px solid var(--border-strong); color: var(--text-main); }
.account-actions .sidebar-btn:hover { border-color: var(--primary); color: var(--primary-text); background: var(--primary-soft); }
.account-actions .sidebar-btn.save-btn { background: var(--primary); color: #ffffff; border-color: transparent; }
.account-actions .sidebar-btn.save-btn:hover { background: var(--primary-hover); color: #ffffff; }

.account-modal input:-webkit-autofill,
.account-modal input:-webkit-autofill:hover,
.account-modal input:-webkit-autofill:focus,
.account-modal input:-webkit-autofill:active {
  -webkit-box-shadow: 0 0 0 30px var(--bg-panel) inset !important;
  -webkit-text-fill-color: var(--text-main) !important;
  caret-color: var(--text-main);
  transition: background-color 9999s ease-in-out 0s;
}
</style>
