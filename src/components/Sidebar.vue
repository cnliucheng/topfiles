<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFilesStore, type Folder, type FileMeta } from '../stores/files'
import { useAuthStore } from '../stores/auth'
import { useDialogStore } from '../stores/dialog'
import { api } from '../api/client'
import ShareDialog from './ShareDialog.vue'
import {
  IconPlus,
  IconShare2,
  IconSearch,
  IconFile,
  IconFileText,
  IconFileCode,
  IconFileSpreadsheet,
  IconFileDescription,
  IconLogout,
  IconSettings,
  IconSortAscending,
  IconX,
  IconFilter,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconChevronRight,
  IconDotsVertical
} from '@tabler/icons-vue'

const { t } = useI18n()
const files = useFilesStore()
const auth = useAuthStore()
const dialog = useDialogStore()
const shareOpen = ref(false)
const emit = defineEmits<{ (e: 'close-mobile'): void }>()

/* ---- 搜索（可折叠） ---- */
const searchQuery = ref('')
const searchExpanded = ref(false)
let searchInputRef = ref<HTMLInputElement | null>(null)

function toggleSearch() {
  searchExpanded.value = !searchExpanded.value
  if (searchExpanded.value) {
    nextTick(() => searchInputRef.value?.focus())
  } else {
    searchQuery.value = ''
  }
}

/* ---- 排序 ---- */
type SortKey = 'updated' | 'name' | 'size'
const sortKey = ref<SortKey>('updated')
const showSortMenu = ref(false)

/* ---- 新建下拉（文件 / 文件夹） ---- */
const showNewMenu = ref(false)

/* ---- 批量操作 ---- */
const batchMode = ref(false)
const selectedIds = ref<Set<number>>(new Set())

/* ---- 文件夹树状态 ---- */
const expandedFolders = ref<Set<number>>(new Set())
const activeFolderId = ref<number | null>(null)
const folderMenuFor = ref<number | null>(null)
const moveMenuFor = ref<number | null>(null)

/* ---- 文件类型图标 ---- */
function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, typeof IconFile> = {
    md: IconFileText, txt: IconFileDescription,
    json: IconFileCode, js: IconFileCode, ts: IconFileCode,
    vue: IconFileCode, css: IconFileCode, html: IconFileCode,
    xml: IconFileCode, yaml: IconFileCode, yml: IconFileCode,
    csv: IconFileSpreadsheet, xlsx: IconFileSpreadsheet, xls: IconFileSpreadsheet,
  }
  return map[ext] ?? IconFile
}

function sortFiles(arr: FileMeta[]): FileMeta[] {
  const q = searchQuery.value.trim().toLowerCase()
  let result = q ? arr.filter(f => f.filename.toLowerCase().includes(q)) : arr.slice()
  switch (sortKey.value) {
    case 'name': result.sort((a, b) => a.filename.localeCompare(b.filename)); break
    case 'size': result.sort((a, b) => b.sizeBytes - a.sizeBytes); break
    default: result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }
  return result
}

function sortFolders(arr: Folder[]): Folder[] {
  return arr.slice().sort((a, b) => a.name.localeCompare(b.name))
}

/* ---- 树结构 ---- */
type TreeNode =
  | { type: 'folder'; folder: Folder; children: TreeNode[] }
  | { type: 'file'; file: FileMeta }

const tree = computed<TreeNode[]>(() => {
  const folderChildren = new Map<number | null, Folder[]>()
  for (const f of files.folders) {
    const key = f.parentId ?? null
    if (!folderChildren.has(key)) folderChildren.set(key, [])
    folderChildren.get(key)!.push(f)
  }
  const fileChildren = new Map<number | null, FileMeta[]>()
  for (const f of files.list) {
    const key = f.folderId ?? null
    if (!fileChildren.has(key)) fileChildren.set(key, [])
    fileChildren.get(key)!.push(f)
  }

  function build(parentKey: number | null): TreeNode[] {
    const folders = sortFolders(folderChildren.get(parentKey) ?? [])
    const fileList = sortFiles(fileChildren.get(parentKey) ?? [])
    const nodes: TreeNode[] = []
    for (const f of folders) {
      nodes.push({ type: 'folder', folder: f, children: build(f.id) })
    }
    for (const fl of fileList) {
      nodes.push({ type: 'file', file: fl })
    }
    return nodes
  }
  return build(null)
})

type VisibleNode =
  | { kind: 'folder'; folder: Folder; depth: number; expanded: boolean }
  | { kind: 'file'; file: FileMeta; depth: number }

const visibleNodes = computed<VisibleNode[]>(() => {
  const out: VisibleNode[] = []
  const searching = !!searchQuery.value.trim()
  function walk(nodes: TreeNode[], depth: number) {
    for (const n of nodes) {
      if (n.type === 'file') {
        out.push({ kind: 'file', file: n.file, depth })
      } else {
        const expanded = searching || expandedFolders.value.has(n.folder.id)
        out.push({ kind: 'folder', folder: n.folder, depth, expanded })
        if (expanded) walk(n.children, depth + 1)
      }
    }
  }
  walk(tree.value, 0)
  return out
})

const visibleFileIds = computed(() =>
  visibleNodes.value.filter(n => n.kind === 'file').map(n => (n as { file: FileMeta }).file.id)
)

const indentStyle = (depth: number) => ({ paddingLeft: `${10 + depth * 16}px` })

/* ---- 文件夹下拉（新建菜单）选项 ---- */
const folderOptions = computed<{ id: number | null; name: string; depth: number }[]>(() => {
  const byParent = new Map<number | null, Folder[]>()
  for (const f of files.folders) {
    const k = f.parentId ?? null
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(f)
  }
  const out: { id: number | null; name: string; depth: number }[] = []
  out.push({ id: null, name: t('files'), depth: 0 })
  function walk(parentKey: number | null, depth: number) {
    for (const f of sortFolders(byParent.get(parentKey) ?? [])) {
      out.push({ id: f.id, name: f.name, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 1)
  return out
})

/* ---- 文件夹交互 ---- */
function toggleFolder(id: number) {
  const next = new Set(expandedFolders.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expandedFolders.value = next
  activeFolderId.value = id
  files.setCurrentFolder(id)
}
function expandFolder(id: number) {
  if (!expandedFolders.value.has(id)) {
    const next = new Set(expandedFolders.value)
    next.add(id)
    expandedFolders.value = next
  }
}

async function createFolderAt(parentId: number | null) {
  const name = await dialog.prompt(t('enterFolderName'), 'New folder', t('newFolderTitle'))
  if (!name || !name.trim()) return
  try {
    await files.createFolder({ name: name.trim(), parentId })
    if (parentId != null) expandFolder(parentId)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } }
    await dialog.alert(err.response?.data?.error?.message || t('folderCreateFailed'), t('error'))
  }
}
async function createFileAt(folderId: number | null) {
  const filename = await dialog.prompt(t('enterFilename'), 'untitled.md', t('newFileTitle'))
  if (!filename) return
  try {
    await files.create({ filename, content: '', ...(folderId != null ? { folderId } : {}) })
    files.setCurrentFolder(folderId)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } }
    await dialog.alert(err.response?.data?.error?.message || t('createFailed'), t('error'))
  }
}
async function renameFolderNow(id: number, currentName: string) {
  const name = await dialog.prompt(t('enterFolderNameRename'), currentName, t('renameFolderTitle'))
  if (!name || !name.trim() || name.trim() === currentName) return
  try {
    await files.renameFolder(id, name.trim())
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } }
    await dialog.alert(err.response?.data?.error?.message || t('folderRenameFailed'), t('error'))
  }
}
async function deleteFolderNow(id: number) {
  const ok = await dialog.confirm(t('confirmDeleteFolder'), t('deleteFolderTitle'))
  if (!ok) return
  try {
    await files.deleteFolder(id)
    const next = new Set(expandedFolders.value)
    next.delete(id)
    expandedFolders.value = next
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } }
    await dialog.alert(err.response?.data?.error?.message || t('folderDeleteFailed'), t('error'))
  }
}
async function moveFileNow(id: number, folderId: number | null) {
  try {
    await files.moveFile(id, folderId)
    moveMenuFor.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } }
    await dialog.alert(err.response?.data?.error?.message || t('moveFailed'), t('error'))
  }
}

function sortLabel(key: SortKey): string {
  return { updated: t('sortUpdated'), name: t('sortName'), size: t('sortSize') }[key]
}

/* ---- 相对时间 ---- */
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return t('justNow')
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}${t('minutesAgo')}`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}${t('hoursAgo')}`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}${t('daysAgo')}`
  return `${Math.floor(day / 30)}${t('monthsAgo')}`
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  if (!batchMode.value) selectedIds.value.clear()
}
function toggleSelect(id: number) {
  selectedIds.value.has(id) ? selectedIds.value.delete(id) : selectedIds.value.add(id)
}
function selectAll() {
  if (selectedIds.value.size === visibleFileIds.value.length) {
    selectedIds.value.clear()
  } else {
    visibleFileIds.value.forEach(id => selectedIds.value.add(id))
  }
}
async function deleteSelected() {
  const count = selectedIds.value.size
  if (!count) return
  const ok = await dialog.confirm(t('confirmDeleteSelected', { count }), t('deleteFileTitle'))
  if (!ok) return
  for (const id of [...selectedIds.value]) {
    try {
      await files.remove(id); selectedIds.value.delete(id)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } }
      await dialog.alert(err.response?.data?.error?.message || t('deleteFailed'), t('error'))
    }
  }
  if (!selectedIds.value.size) batchMode.value = false
}

/* ---- 账户设置 ---- */
const accountOpen = ref(false)
const accountForm = ref({ currentPassword: '', newUsername: '', newPassword: '' })
const accountSubmitting = ref(false)
const accountError = ref<string | null>(null)

function openAccount() {
  accountForm.value = { currentPassword: '', newUsername: '', newPassword: '' }
  accountError.value = null; accountOpen.value = true
}
async function saveAccount() {
  if (!accountForm.value.currentPassword) { accountError.value = t('accountCurrentPasswordRequired'); return }
  if (!accountForm.value.newUsername && !accountForm.value.newPassword) { accountError.value = t('accountNothingChanged'); return }
  accountSubmitting.value = true; accountError.value = null
  try {
    const res = await api.put<{ username: string }>('/api/auth/account', accountForm.value)
    auth.user = { username: res.data.username }; accountOpen.value = false
    await dialog.alert(t('accountUpdated'), t('success'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } }
    accountError.value = err.response?.data?.error?.message || t('accountSaveFailed')
  } finally { accountSubmitting.value = false }
}

onMounted(() => {
  if (auth.isLoggedIn) {
    files.fetchList()
    files.fetchFolders()
  }
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

function onDocClick(e: MouseEvent) {
  const el = e.target as HTMLElement | null
  if (el && (el.closest('[data-menu-trigger]') || el.closest('[data-menu]'))) return
  if (folderMenuFor.value !== null) folderMenuFor.value = null
  if (moveMenuFor.value !== null) moveMenuFor.value = null
  if (showNewMenu.value) showNewMenu.value = false
}

async function newFile() {
  await createFileAt(activeFolderId.value)
}
async function loadFile(id: number) {
  if (batchMode.value) { toggleSelect(id); return }
  await files.loadFile(id); emit('close-mobile')
}
async function removeFile(id: number, event: Event) {
  event.stopPropagation()
  const ok = await dialog.confirm(t('confirmDelete'), t('deleteFileTitle'))
  if (!ok) return
  try { await files.remove(id) }
  catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } }
    await dialog.alert(err.response?.data?.error?.message || t('deleteFailed'), t('error'))
  }
}
async function onLogout() {
  const ok = await dialog.confirm(t('confirmLogout'), t('logoutTitle'))
  if (!ok) return
  try { await auth.logout(); files.clearAll() }
  catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { message?: string } } } }
    await dialog.alert(err.response?.data?.error?.message || t('logoutFailed'), t('error'))
  }
}
function openShare() {
  if (!files.current) { dialog.alert(t('selectFileFirst'), t('hint')); return }
  shareOpen.value = true
}
</script>

<template>
  <div class="sb">
    <!-- ===== 顶部品牌区 ===== -->
    <div class="sb-top">
      <span class="sb-brand">TopFiles</span>
      <div class="sb-top-actions">
        <button class="sb-icon-btn" :title="t('searchFiles')" :class="{ active: searchExpanded }" @click="toggleSearch">
          <IconSearch :size="18" :stroke-width="1.8" />
        </button>
        <div class="sb-sort-wrap">
          <button class="sb-icon-btn" :title="t('sortBy')" @click="showSortMenu = !showSortMenu">
            <IconFilter :size="18" :stroke-width="1.8" />
          </button>
          <Transition name="sb-fade">
            <div v-if="showSortMenu" class="sb-dropdown" @click.stop>
              <button
                v-for="sk in (['updated', 'name', 'size'] as SortKey[])"
                :key="sk"
                class="sb-dd-item"
                :class="{ active: sortKey === sk }"
                @click="sortKey = sk; showSortMenu = false"
              >{{ sortLabel(sk) }}</button>
            </div>
          </Transition>
        </div>
        <button class="sb-icon-btn sb-mobile-only" :aria-label="t('closeFileList')" @click="emit('close-mobile')">
          <IconX :size="18" :stroke-width="2" />
        </button>
      </div>
    </div>

    <!-- ===== 可折叠搜索框 ===== -->
    <Transition name="sb-slide-y">
      <div v-if="searchExpanded" class="sb-search-bar">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          class="sb-search-input"
          :placeholder="t('searchFiles')"
          type="text"
          @keyup.escape="toggleSearch"
        />
      </div>
    </Transition>

    <!-- ===== 导航操作行 — 大按钮风格 ===== -->
    <nav class="sb-nav">
      <div class="sb-nav-new-wrap">
        <button class="sb-nav-item" data-menu-trigger @click="showNewMenu = !showNewMenu">
          <IconPlus :size="18" :stroke-width="1.8" class="sb-nav-icon" />
          <span>{{ t('new') }}</span>
        </button>
        <Transition name="sb-fade">
          <div v-if="showNewMenu" class="sb-dropdown sb-new-menu" data-menu @click.stop>
            <button class="sb-dd-item" @click="newFile(); showNewMenu = false">
              <IconFileText :size="15" :stroke-width="1.8" class="sb-dd-ico" />
              <span>{{ t('newFileShort') }}</span>
            </button>
            <button class="sb-dd-item" @click="createFolderAt(activeFolderId); showNewMenu = false">
              <IconFolderPlus :size="15" :stroke-width="1.8" class="sb-dd-ico" />
              <span>{{ t('newFolderShort') }}</span>
            </button>
          </div>
        </Transition>
      </div>
      <button class="sb-nav-item" @click="openShare" :disabled="!files.current">
        <IconShare2 :size="18" :stroke-width="1.8" class="sb-nav-icon" />
        <span>{{ t('share') }}</span>
      </button>
      <button v-if="files.list.length > 0" class="sb-nav-item" @click="toggleBatchMode" :class="{ active: batchMode }">
        <IconSortAscending :size="18" :stroke-width="1.8" class="sb-nav-icon" />
        <span>{{ batchMode ? t('cancelSelection') : t('batchDelete') }}</span>
      </button>
    </nav>

    <!-- ===== 分区标题 — "空间 (N)" 风格 ===== -->
    <div class="sb-section-header">
      <span class="sb-section-label">{{ t('files') }}</span>
      <span class="sb-section-count">({{ files.list.length }})</span>
    </div>

    <!-- ===== 批量操作条 ===== -->
    <Transition name="sb-slide-y">
      <div v-if="batchMode && visibleFileIds.length > 0" class="sb-batch-row">
        <span class="sb-batch-label">{{ selectedIds.size }} {{ t('selected') }}</span>
        <button class="sb-batch-act" @click="selectAll">{{ t('selectAll') }}</button>
        <button v-if="selectedIds.size > 0" class="sb-batch-act sb-batch-danger" @click="deleteSelected">{{ t('deleteSelected') }}</button>
      </div>
    </Transition>

    <!-- ===== 文件 / 文件夹树主体 ===== -->
    <div class="sb-body">
      <div v-if="files.loading" class="sb-empty">
        <div class="sb-spinner"></div>
        <span>{{ t('loading') }}</span>
      </div>
      <div v-else-if="visibleNodes.length === 0" class="sb-empty">
        <IconFolder :size="32" :stroke-width="1.2" class="sb-empty-icon" />
        <span>{{ searchQuery ? t('noMatch') : t('noFiles') }}</span>
      </div>
      <ul v-else class="sb-file-list">
        <template v-for="(n, i) in visibleNodes" :key="i">
          <!-- 文件夹节点 -->
          <li
            v-if="n.kind === 'folder'"
            class="sb-folder-item"
            :class="{ active: activeFolderId === n.folder.id }"
            :style="indentStyle(n.depth)"
            @click="toggleFolder(n.folder.id)"
          >
            <button class="sb-chevron" @click.stop="toggleFolder(n.folder.id)" :aria-label="t('folders')">
              <IconChevronRight :size="14" :stroke-width="2" :class="{ open: n.expanded }" />
            </button>
            <component :is="n.expanded ? IconFolderOpen : IconFolder" :size="17" :stroke-width="1.7" class="sb-folder-icon" />
            <span class="sb-fi-name" :title="n.folder.name">{{ n.folder.name }}</span>

            <span class="sb-fi-act" :title="t('newFile')" @click.stop="createFileAt(n.folder.id)" role="button" tabindex="0">
              <IconPlus :size="14" :stroke-width="2" />
            </span>
            <span class="sb-fi-more" data-menu-trigger :title="t('moreActions')" @click.stop="folderMenuFor = folderMenuFor === n.folder.id ? null : n.folder.id" role="button" tabindex="0">
              <IconDotsVertical :size="15" :stroke-width="2" />
            </span>
            <span class="sb-fi-act-del" :title="t('deleteFolderTitle')" @click.stop="deleteFolderNow(n.folder.id)" role="button" tabindex="0">
              <IconX :size="14" :stroke-width="2" />
            </span>

            <Transition name="sb-fade">
              <div v-if="folderMenuFor === n.folder.id" class="sb-dropdown sb-folder-menu" data-menu @click.stop>
                <button class="sb-dd-item" @click="createFolderAt(n.folder.id); folderMenuFor = null">{{ t('newSubfolder') }}</button>
                <div class="sb-dd-sep"></div>
                <button class="sb-dd-item" @click="renameFolderNow(n.folder.id, n.folder.name); folderMenuFor = null">{{ t('renameFolder') }}</button>
              </div>
            </Transition>
          </li>

          <!-- 文件节点 -->
          <li
            v-else
            class="sb-file-item"
            :class="{ active: files.current?.id === n.file.id, selected: selectedIds.has(n.file.id) }"
            :style="indentStyle(n.depth)"
            @click="loadFile(n.file.id)"
          >
            <input v-if="batchMode" type="checkbox" class="sb-cb" :checked="selectedIds.has(n.file.id)" @click.stop="toggleSelect(n.file.id)" />
            <component :is="getFileIcon(n.file.filename)" :size="17" :stroke-width="1.7" class="sb-fi-icon" />
            <span class="sb-fi-name" :title="n.file.filename">{{ n.file.filename }}</span>
            <span class="sb-fi-time">{{ relativeTime(n.file.updatedAt) }}</span>

            <span v-if="!batchMode" class="sb-fi-act" data-menu-trigger :title="t('moveToFolder')" @click.stop="moveMenuFor = moveMenuFor === n.file.id ? null : n.file.id" role="button" tabindex="0">
              <IconFolderPlus :size="14" :stroke-width="2" />
            </span>
            <span v-if="!batchMode" class="sb-fi-del" @click="removeFile(n.file.id, $event)" :title="t('deleteFile')" role="button" tabindex="0">
              <IconX :size="14" :stroke-width="2" />
            </span>

            <Transition name="sb-fade">
              <div v-if="moveMenuFor === n.file.id" class="sb-dropdown sb-move-menu" data-menu @click.stop>
                <button
                  v-for="opt in folderOptions"
                  :key="opt.id ?? 'root'"
                  class="sb-dd-item"
                  :class="{ active: n.file.folderId === opt.id }"
                  :style="{ paddingLeft: 10 + opt.depth * 12 + 'px' }"
                  @click="moveFileNow(n.file.id, opt.id)"
                >{{ opt.id === null ? t('files') : opt.name }}</button>
              </div>
            </Transition>
          </li>
        </template>
      </ul>
    </div>

    <!-- ===== 底部用户区 — 圆形头像风格 ===== -->
    <div class="sb-bottom">
      <div class="sb-user-card" @click="openAccount" role="button" :tabindex="0" @keydown.enter="openAccount">
        <span class="sb-avatar">{{ (auth.user?.username ?? '?').slice(0, 1).toUpperCase() }}</span>
        <span class="sb-uname">{{ auth.user?.username }}</span>
      </div>
      <button class="sb-icon-btn sb-bottom-btn" :title="t('logout')" @click="onLogout">
        <IconLogout :size="17" :stroke-width="1.8" />
      </button>
      <button class="sb-icon-btn sb-bottom-btn" :title="t('accountSettings')" @click="openAccount">
        <IconSettings :size="17" :stroke-width="1.8" />
      </button>
    </div>

    <!-- ===== 账户弹窗 ===== -->
    <Teleport to="body">
      <Transition name="sb-fade">
        <div v-if="accountOpen" class="sb-overlay" @click.self="accountOpen = false">
          <div class="sb-modal">
            <h4>{{ t('accountSettings') }}</h4>
            <label><span>{{ t('currentPassword') }}</span><input v-model="accountForm.currentPassword" type="password" :placeholder="t('currentPasswordPlaceholder')" /></label>
            <label><span>{{ t('newUsernameLabel') }}</span><input v-model="accountForm.newUsername" type="text" :placeholder="t('newUsernamePlaceholder')" /></label>
            <label><span>{{ t('newPasswordLabel') }}</span><input v-model="accountForm.newPassword" type="password" :placeholder="t('newPasswordPlaceholder')" /></label>
            <p v-if="accountError" class="sb-err">{{ accountError }}</p>
            <div class="sb-modal-foot">
              <button class="sb-mbtn" @click="accountOpen = false">{{ t('cancel') }}</button>
              <button class="sb-mbtn sb-msave" :disabled="accountSubmitting" @click="saveAccount">{{ accountSubmitting ? t('saving') : t('saveChanges') }}</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ShareDialog v-model:open="shareOpen" :filename="files.current?.filename ?? null" />
  </div>
</template>

<style scoped>
/* ============================================================
   TopFiles Sidebar — WorkBuddy Native Style + Folder Tree
   ============================================================ */

.sb {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--bg-subtle);
  font-family: inherit;
}

/* ==================== 顶部品牌区 ==================== */
.sb-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 16px;
  flex-shrink: 0;
}
.sb-brand {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-faint);
  letter-spacing: -0.01em;
}
.sb-top-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.sb-icon-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color 0.12s, color 0.12s;
}
.sb-icon-btn:hover { background: var(--bg-hover); color: var(--text-main); }
.sb-icon-btn.active { background: var(--primary-soft); color: var(--primary-text); }
.sb-mobile-only { display: none; }

/* 排序下拉 */
.sb-sort-wrap { position: relative; }
.sb-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  min-width: 140px;
  padding: 5px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg-panel);
  box-shadow: var(--shadow-lg);
}
.sb-dd-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-main);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.1s;
}
.sb-dd-item:hover { background: var(--bg-hover); }
.sb-dd-item.active { background: var(--primary-soft); color: var(--primary-text); font-weight: 600; }
.sb-dd-sep { height: 1px; background: var(--border); margin: 4px 6px; }

/* ==================== 可折叠搜索框 ==================== */
.sb-search-bar {
  padding: 0 14px 10px;
  flex-shrink: 0;
}
.sb-search-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  color: var(--text-main);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sb-search-input::placeholder { color: var(--text-faint); }
.sb-search-input:hover { border-color: var(--primary); }
.sb-search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }

/* ==================== 导航操作行 — 大按钮 ==================== */
.sb-nav {
  display: flex;
  flex-direction: column;
  padding: 4px 8px 6px;
  flex-shrink: 0;
}
.sb-nav-new-wrap { position: relative; }
.sb-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-main);
  font-size: 13px;
  font-weight: 450;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background-color 0.12s ease;
}
.sb-nav-item:hover { background: var(--bg-hover); }
.sb-nav-item.active { background: var(--bg-active); }
.sb-nav-item:disabled { opacity: 0.42; cursor: not-allowed; }
.sb-nav-item:disabled:hover { background: transparent; }
.sb-nav-icon {
  flex-shrink: 0;
  color: var(--text-sub);
  transition: color 0.12s;
}
.sb-nav-item:hover .sb-nav-icon { color: var(--text-main); }
.sb-nav-item.active .sb-nav-icon { color: var(--primary-text); }

/* ==================== 分区标题 ==================== */
.sb-section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 14px 16px 7px;
  flex-shrink: 0;
}
.sb-section-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-sub);
}
.sb-section-count {
  font-size: 13px;
  font-weight: 450;
  color: var(--text-faint);
}

/* ==================== 批量操作条 ==================== */
.sb-batch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px 10px;
  flex-shrink: 0;
}
.sb-batch-label {
  font-size: 12px;
  font-weight: 650;
  color: var(--primary-text);
  margin-right: auto;
}
.sb-batch-act {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-panel);
  color: var(--text-sub);
  font-size: 11.5px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
}
.sb-batch-act:hover { border-color: var(--primary); color: var(--primary-text); }
.sb-batch-danger { border-color: var(--danger); color: var(--danger); }
.sb-batch-danger:hover { background: var(--danger-soft); }

/* ==================== 文件 / 文件夹树主体 ==================== */
.sb-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px 10px;
}

/* 空状态 */
.sb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 16px;
  color: var(--text-faint);
  font-size: 13px;
}
.sb-empty-icon { opacity: 0.35; }
.sb-spinner {
  width: 24px;
  height: 24px;
  border: 2.5px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: sb-spin 0.65s linear infinite;
}
@keyframes sb-spin { to { transform: rotate(360deg); } }

/* 列表 */
.sb-file-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* ---- 文件夹项 ---- */
.sb-folder-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px 0 12px;
  margin: 1px 0;
  border-radius: var(--radius-md);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease;
}
.sb-folder-item:hover { background: var(--bg-hover); }
.sb-folder-item.active { background: var(--bg-active); }

.sb-chevron {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.sb-chevron svg { transition: transform 0.15s ease; }
.sb-chevron svg.open { transform: rotate(90deg); }

.sb-folder-icon {
  flex-shrink: 0;
  color: var(--primary-text);
  opacity: 0.8;
  transition: color 0.12s ease;
}
.sb-folder-item:hover .sb-folder-icon { color: var(--primary); opacity: 1; }

/* 行内操作图标（悬浮显示，绝对定位，纯图标无容器感） */
.sb-fi-act,
.sb-fi-del,
.sb-fi-more,
.sb-fi-act-del {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-faint);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s, color 0.12s;
}
.sb-fi-act svg,
.sb-fi-del svg,
.sb-fi-more svg,
.sb-fi-act-del svg {
  display: block;
}
/* 右侧停靠：文件夹行 [+ 58][⋯ 32][× 6]；文件行 [move 32][× 6] */
.sb-folder-item .sb-fi-act { right: 58px; }
.sb-folder-item .sb-fi-more { right: 32px; }
.sb-folder-item .sb-fi-act-del { right: 6px; }
.sb-file-item .sb-fi-act { right: 32px; }
.sb-file-item .sb-fi-del { right: 6px; }

/* 行悬浮时全部操作图标显现 */
.sb-folder-item:hover .sb-fi-act,
.sb-folder-item:hover .sb-fi-more,
.sb-folder-item:hover .sb-fi-act-del,
.sb-file-item:hover .sb-fi-act,
.sb-file-item:hover .sb-fi-del { opacity: 1; }

.sb-fi-act:hover { color: var(--primary-text); }
.sb-fi-more:hover { color: var(--primary-text); }
.sb-fi-act-del:hover,
.sb-fi-del:hover { color: var(--danger); }

/* 文件夹新建菜单 / 移动菜单 */
.sb-folder-menu { top: calc(100% - 4px); left: 24px; right: auto; }
.sb-move-menu { top: calc(100% - 4px); right: 8px; left: auto; min-width: 160px; max-height: 240px; overflow-y: auto; }
.sb-new-menu { top: calc(100% + 4px); left: 0; right: auto; min-width: 150px; }

/* 下拉项内图标 */
.sb-dd-ico {
  flex-shrink: 0;
  color: var(--text-sub);
  transition: color 0.12s;
}
.sb-dd-item:hover .sb-dd-ico { color: var(--primary-text); }

/* ---- 文件项 — WorkBuddy 风格：宽松、柔和 ---- */
.sb-file-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px 0 12px;
  margin: 1px 0;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color 0.15s ease;
  user-select: none;
}
.sb-file-item:hover { background: var(--bg-hover); }
.sb-file-item.active { background: var(--bg-active); }

/* 复选框 */
.sb-cb {
  flex-shrink: 0;
  cursor: pointer;
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

/* 图标 */
.sb-fi-icon {
  flex-shrink: 0;
  color: var(--text-faint);
  transition: color 0.12s ease;
}
.sb-file-item:hover .sb-fi-icon { color: var(--text-sub); }
.sb-file-item.active .sb-fi-icon { color: var(--text-sub); opacity: 0.85; }

/* 文件名 */
.sb-fi-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 450;
  line-height: 1.3;
  color: var(--text-main);
}
.sb-file-item.active .sb-fi-name { font-weight: 620; }
/* 悬浮时给行内操作按钮（+/⋯/×）让出空间，避免文字与其重叠 */
.sb-folder-item:hover .sb-fi-name { padding-right: 92px; }
.sb-file-item:hover .sb-fi-name { padding-right: 64px; }

/* 相对时间元数据 */
.sb-fi-time {
  flex-shrink: 0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
  opacity: 0.75;
}
.sb-file-item.active .sb-fi-time { opacity: 0.55; }

/* 选中态 */
.sb-file-item.selected { background: var(--primary-soft); }

/* ==================== 底部用户区 ==================== */
.sb-bottom {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 12px 14px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.sb-user-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 4px 8px;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background-color 0.12s;
}
.sb-user-card:hover { background: var(--bg-hover); }
.sb-user-card:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--ring); }

/* 圆形彩色头像 */
.sb-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #635bff 0%, #48c6ef 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(99, 91, 255, 0.3);
}
:root[data-theme='dark'] .sb-avatar {
  background: linear-gradient(135deg, #7d75ff 0%, #5eead4 100%);
  box-shadow: 0 1px 3px rgba(125, 117, 255, 0.35);
}
.sb-uname {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 550;
  color: var(--text-main);
}
.sb-bottom-btn { color: var(--text-faint); }
.sb-bottom-btn:hover { color: var(--text-main); }

/* ==================== 账户弹窗 ==================== */
.sb-overlay {
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
.sb-modal {
  background: var(--bg-panel);
  color: var(--text-main);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 26px;
  max-width: 400px;
  width: 100%;
  box-shadow: var(--shadow-xl);
}
.sb-modal h4 { margin: 0 0 20px; font-size: 17px; font-weight: 680; letter-spacing: -0.01em; }
.sb-modal label { display: block; margin-bottom: 14px; }
.sb-modal label > span { display: block; margin-bottom: 6px; font-size: 12.5px; font-weight: 550; color: var(--text-sub); }
.sb-modal input {
  width: 100%;
  height: 40px;
  padding: 0 13px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  color: var(--text-main);
  font-size: 14.5px;
  box-sizing: border-box;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.sb-modal input:hover { border-color: var(--primary); }
.sb-modal input:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px var(--ring); }
.sb-err { color: var(--danger); font-size: 12.5px; margin: 4px 0 14px; }
.sb-modal-foot { display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end; }
.sb-mbtn {
  height: 36px;
  padding: 0 18px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  color: var(--text-main);
  font-size: 13.5px;
  font-weight: 550;
  cursor: pointer;
  transition: all 0.12s;
}
.sb-mbtn:hover { border-color: var(--primary); color: var(--primary-text); background: var(--primary-soft); }
.sb-msave { background: var(--primary); color: #ffffff; border-color: transparent; }
.sb-msave:hover { background: var(--primary-hover); color: #ffffff; }
.sb-mbtn:disabled { opacity: 0.5; cursor: not-allowed; }

/* autofill */
.sb-modal input:-webkit-autofill,
.sb-modal input:-webkit-autofill:hover,
.sb-modal input:-webkit-autofill:focus,
.sb-modal input:-webkit-autofill:active {
  -webkit-box-shadow: 0 0 0 30px var(--bg-panel) inset !important;
  -webkit-text-fill-color: var(--text-main) !important;
  caret-color: var(--text-main);
  transition: background-color 9999s ease-in-out 0s;
}

/* ==================== 过渡动画 ==================== */
.sb-fade-enter-active, .sb-fade-leave-active { transition: opacity 0.15s ease; }
.sb-fade-enter-from, .sb-fade-leave-to { opacity: 0; }

.sb-slide-y-enter-active, .sb-slide-y-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.sb-slide-y-enter-from, .sb-slide-y-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-bottom: 0;
}

/* ==================== 移动端适配 ==================== */
@media (max-width: 768px) {
  .sb-mobile-only { display: inline-flex; align-items: center; justify-content: center; }
  .sb-fi-del, .sb-fi-act { opacity: 1; }
  .sb-bottom-btn { width: 36px; }
}
</style>
