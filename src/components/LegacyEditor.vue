<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFilesStore } from '../stores/files'
import { useAuthStore } from '../stores/auth'
import { useDialogStore } from '../stores/dialog'
import { useUiStore } from '../stores/ui'
import CodeEditor from './CodeEditor.vue'
import { FILE_TYPES, type FileExtension } from '../constants/fileTypes'
import { LOCALE_STORAGE_KEY, type AppLocale } from '../i18n'
import { useTheme } from '../composables/useTheme'
import { buildFileName, downloadFile, getMimeType, inferSupportedExtension } from '../utils/file'
import {
  IconMenu2,
  IconFile,
  IconUpload,
  IconSun,
  IconMoon,
  IconShieldCheck,
  IconWorld,
  IconInfoCircle,
  IconUser,
  IconDeviceFloppy,
  IconDownload,
  IconTrash,
  IconTypography
} from '@tabler/icons-vue'

const filesStore = useFilesStore()
const authStore = useAuthStore()
const dialog = useDialogStore()
const ui = useUiStore()

const fileName = ref('untitled')
const ext = ref<FileExtension>('txt')
const content = ref('')
const localFileInputRef = ref<HTMLInputElement | null>(null)
const showImportModal = ref(false)
const importUrl = ref('')
const importError = ref('')
const importLoading = ref(false)
const importAbortController = ref<AbortController | null>(null)
const useJinaMode = ref(false)
const privacyMode = ref(false)
const showPrivacyModal = ref(false)
const pendingPrivacyMode = ref(false)
const showAboutModal = ref(false)
const showFileTypeMenu = ref(false)
const fileTypeMenuRef = ref<HTMLElement | null>(null)
const importModalRef = ref<HTMLElement | null>(null)
const aboutModalRef = ref<HTMLElement | null>(null)
const privacyModalRef = ref<HTMLElement | null>(null)
const lastFocusedEl = ref<HTMLElement | null>(null)

/* ---- 焦点管理工具 ---- */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

function saveFocus(): void {
  lastFocusedEl.value = (document.activeElement as HTMLElement) ?? null
}

function restoreFocus(): void {
  lastFocusedEl.value?.focus()
  lastFocusedEl.value = null
}

async function focusModalContent(el: HTMLElement | null): Promise<void> {
  if (!el) return
  await nextTick()
  const focusable = getFocusableElements(el)
  if (focusable.length > 0) {
    focusable[0].focus()
  } else {
    el.focus()
  }
}

function trapFocus(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') return
  const focusable = getFocusableElements(container)
  if (focusable.length === 0) {
    event.preventDefault()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault()
      last.focus()
    }
  } else {
    if (document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}

const { t, te, locale } = useI18n()

/** 文件类型显示标签：优先 i18n 翻译，缺失时回退到 FILE_TYPES 内置 label */
function fileTypeLabel(ext: FileExtension): string {
  const key = `fileTypes.${ext}`
  return te(key) ? t(key) : (FILE_TYPES.find((f) => f.ext === ext)?.label ?? ext)
}
const DRAFT_STORAGE_KEY = 'file-builder-draft-v1'
const PRIVACY_MODE_KEY = 'file-builder-privacy-mode-v1'
const FONT_SIZE_KEY = 'file-builder-font-size-v1'
const MAX_IMPORT_BYTES = 2 * 1024 * 1024
const IMPORT_TIMEOUT_MS = 12_000
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MIN_FONT_SIZE = 11
const MAX_FONT_SIZE = 20
const CLOUD_SAVE_DEBOUNCE_MS = 500

let cloudSaveTimer: number | null = null
let pendingCloudSave: { id: number; content: string; mimeType: string } | null = null
let cloudSaveInFlight = false

const activeLocale = computed({
  get: () => locale.value as AppLocale,
  set: (value: AppLocale) => {
    locale.value = value
  }
})
const editorFontSize = ref(13)

function safeGetStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Ignore storage write failures in restricted environments.
  }
}

function safeRemoveStorage(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore storage remove failures in restricted environments.
  }
}

function loadDraft(): void {
  const fontSaved = Number(safeGetStorage(FONT_SIZE_KEY) ?? '')
  if (!Number.isNaN(fontSaved) && fontSaved >= MIN_FONT_SIZE && fontSaved <= MAX_FONT_SIZE) {
    editorFontSize.value = fontSaved
  }

  const privacySaved = safeGetStorage(PRIVACY_MODE_KEY)
  privacyMode.value = privacySaved === '1'
  if (privacyMode.value) return

  const raw = safeGetStorage(DRAFT_STORAGE_KEY)
  if (!raw) return

  try {
    const parsed = JSON.parse(raw) as Partial<{
      fileName: string
      ext: string
      content: string
      savedAt: number
    }>
    if (typeof parsed.savedAt === 'number' && Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      safeRemoveStorage(DRAFT_STORAGE_KEY)
      return
    }

    if (typeof parsed.fileName === 'string') fileName.value = parsed.fileName
    if (typeof parsed.content === 'string') content.value = parsed.content
    if (
      typeof parsed.ext === 'string' &&
      FILE_TYPES.some((item) => item.ext === parsed.ext)
    ) {
      ext.value = parsed.ext as FileExtension
    }
  } catch {
    // Ignore invalid draft data.
  }
}

function saveDraft(): void {
  if (privacyMode.value) return

  // 保存到 localStorage
  safeSetStorage(
    DRAFT_STORAGE_KEY,
    JSON.stringify({
      fileName: fileName.value,
      ext: ext.value,
      content: content.value,
      savedAt: Date.now()
    })
  )

  // 如果登录，延迟并串行保存到云端，避免较早请求在网络延迟下覆盖新内容。
  if (authStore.isLoggedIn) {
    const fullFilename = `${fileName.value}.${ext.value}`
    const existing = filesStore.list.find(
      f => f.filename.toLowerCase() === fullFilename.toLowerCase()
    )
    const fileId = filesStore.current?.id ?? existing?.id
    if (fileId) queueCloudSave(fileId, content.value, getMimeType(ext.value))
  }
}

function queueCloudSave(id: number, nextContent: string, mimeType: string): void {
  pendingCloudSave = { id, content: nextContent, mimeType }
  if (cloudSaveTimer !== null) window.clearTimeout(cloudSaveTimer)
  cloudSaveTimer = window.setTimeout(() => {
    cloudSaveTimer = null
    void flushCloudSave()
  }, CLOUD_SAVE_DEBOUNCE_MS)
}

async function flushCloudSave(): Promise<void> {
  if (cloudSaveInFlight || !pendingCloudSave) return
  cloudSaveInFlight = true
  const snapshot = pendingCloudSave
  pendingCloudSave = null
  try {
    await filesStore.update(snapshot.id, { content: snapshot.content, mimeType: snapshot.mimeType })
  } catch {
    // 自动保存失败不打断本地编辑；用户可使用显式保存重试。
  } finally {
    cloudSaveInFlight = false
    if (pendingCloudSave) void flushCloudSave()
  }
}

watch(
  () => activeLocale.value,
  (nextLocale) => {
    safeSetStorage(LOCALE_STORAGE_KEY, nextLocale)
    document.documentElement.lang = nextLocale
  }
)

watch(
  () => privacyMode.value,
  (enabled) => {
    safeSetStorage(PRIVACY_MODE_KEY, enabled ? '1' : '0')
    if (enabled) {
      safeRemoveStorage(DRAFT_STORAGE_KEY)
    } else {
      saveDraft()
    }
  }
)

watch(
  () => editorFontSize.value,
  (value) => {
    safeSetStorage(FONT_SIZE_KEY, String(value))
  }
)

watch(
  () => fileName.value,
  (nextName) => {
    const detected = inferSupportedExtension(nextName)
    if (detected && detected !== ext.value) {
      ext.value = detected
    }
  }
)

loadDraft()

// 监听云端文件加载（登录后点击侧边栏文件）
watch(() => filesStore.current, (newFile) => {
  if (newFile && authStore.isLoggedIn) {
    // 加载云端文件内容
    content.value = newFile.content
    fileName.value = newFile.filename.replace(/\.[^/.]+$/, '') || 'untitled'
    const detected = inferSupportedExtension(newFile.filename)
    if (detected) {
      ext.value = detected as FileExtension
    }
  }
})

watch([fileName, ext, content], () => {
  saveDraft()
})

onMounted(() => {
  document.documentElement.lang = activeLocale.value
  document.addEventListener('click', onDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  if (cloudSaveTimer !== null) window.clearTimeout(cloudSaveTimer)
})

// 使用统一主题 composable
const { themeMode, toggleTheme } = useTheme()

function toggleLocale(): void {
  activeLocale.value = activeLocale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
}

function toggleFileTypeMenu(): void {
  showFileTypeMenu.value = !showFileTypeMenu.value
}

function selectFileType(nextExt: FileExtension): void {
  ext.value = nextExt
  showFileTypeMenu.value = false
}

// 保存到云端
async function onSaveToCloud(): Promise<void> {
  if (!authStore.isLoggedIn) return

  const fullFilename = `${fileName.value}.${ext.value}`

  try {
    // 检查是否已有同名文件
    const existing = filesStore.list.find(
      f => f.filename.toLowerCase() === fullFilename.toLowerCase()
    )

    if (existing) {
      // 更新现有文件
      await filesStore.update(existing.id, {
        content: content.value,
        mimeType: getMimeType(ext.value)
      })
      await dialog.alert('已保存到云端', '保存成功')
    } else {
      // 创建新文件
      await filesStore.create({
        filename: fullFilename,
        content: content.value,
        mimeType: getMimeType(ext.value)
      })
      await dialog.alert('已创建云端文件', '创建成功')
    }
  } catch (e: any) {
    await dialog.alert(e.response?.data?.error?.message || '保存失败', '错误')
  }
}

function onDownload(): void {
  const detectedExt = inferSupportedExtension(fileName.value)
  const finalExt = (detectedExt ?? ext.value) as FileExtension
  const finalFileName = buildFileName(fileName.value, finalExt)
  const mime = getMimeType(finalExt)
  downloadFile(content.value, finalFileName, mime)
}

function onClearDraft(): void {
  fileName.value = 'untitled'
  ext.value = 'txt'
  content.value = ''
  safeRemoveStorage(DRAFT_STORAGE_KEY)
}

function togglePrivacyMode(): void {
  pendingPrivacyMode.value = !privacyMode.value
  saveFocus()
  showPrivacyModal.value = true
  void focusModalContent(privacyModalRef.value)
}

function closePrivacyModal(): void {
  restoreFocus()
  showPrivacyModal.value = false
}

function confirmPrivacyMode(): void {
  privacyMode.value = pendingPrivacyMode.value
  restoreFocus()
  showPrivacyModal.value = false
}

function openAboutModal(): void {
  saveFocus()
  showAboutModal.value = true
  void focusModalContent(aboutModalRef.value)
}

function closeAboutModal(): void {
  restoreFocus()
  showAboutModal.value = false
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as Node | null
  if (!target || !fileTypeMenuRef.value) return
  if (!fileTypeMenuRef.value.contains(target)) {
    showFileTypeMenu.value = false
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)}KB`
  }
  return `${bytes}B`
}

function applyImportedContent(name: string, text: string): void {
  content.value = text
  fileName.value = name || 'untitled'
  const detected = inferSupportedExtension(fileName.value)
  if (detected) {
    ext.value = detected
  }
}

function buildImportCandidates(url: string): string[] {
  const encoded = encodeURIComponent(url)

  return [
    url,
    `https://api.allorigins.win/raw?url=${encoded}`,
    `https://cors.isomorphic-git.org/${encoded}`,
  ]
}

function toJinaUrl(url: string): string {
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`
  return `https://r.jina.ai/http://${withScheme.replace(/^https?:\/\//i, '')}`
}

function normalizeImportUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const parsed = new URL(withScheme)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  importAbortController.value?.abort()
  const controller = new AbortController()
  importAbortController.value = controller
  const timer = window.setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
    if (importAbortController.value === controller) {
      importAbortController.value = null
    }
  }
}

async function readResponseTextWithLimit(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? '')
  if (!Number.isNaN(contentLength) && contentLength > MAX_IMPORT_BYTES) {
    throw new Error('too-large')
  }

  if (!response.body) {
    return await response.text()
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  const parts: string[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > MAX_IMPORT_BYTES) {
      throw new Error('too-large')
    }
    parts.push(decoder.decode(value, { stream: true }))
  }
  parts.push(decoder.decode())

  return parts.join('')
}

function stripJinaHeader(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n')

  // 仅在文件头部（前 600 字符）查找 jina 元信息标记，避免误删正文
  const HEADER_WINDOW = 600
  const header = normalized.slice(0, HEADER_WINDOW)
  const rest = normalized.slice(HEADER_WINDOW)

  const marker = 'Markdown Content:\n'
  const markerIndex = header.indexOf(marker)
  if (markerIndex >= 0) {
    const afterMarker = header.slice(markerIndex + marker.length).trimStart()
    return afterMarker + rest
  }

  const lines = header.split('\n')
  const urlSourceIndex = lines.findIndex((line) => line.startsWith('URL Source:'))
  if (urlSourceIndex >= 0) {
    const firstContent = lines.findIndex((line, idx) => idx > urlSourceIndex && line.trim() !== '')
    if (firstContent > -1) {
      return lines.slice(firstContent).join('\n') + '\n' + rest
    }
  }

  return normalized
}

async function fetchTextWithFallback(url: string): Promise<string> {
  if (useJinaMode.value) {
    const response = await fetchWithTimeout(toJinaUrl(url))
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const raw = await readResponseTextWithLimit(response)
    return stripJinaHeader(raw)
  }

  const candidates = buildImportCandidates(url)
  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      const response = await fetchWithTimeout(candidate)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return await readResponseTextWithLimit(response)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('Import failed')
}

async function importFromUrl(url: string): Promise<void> {
  const text = await fetchTextWithFallback(url)
  let parsedName = 'remote-file'
  try {
    const { pathname } = new URL(url)
    const last = pathname.split('/').filter(Boolean).pop()
    if (last) parsedName = decodeURIComponent(last)
  } catch {
    // Keep fallback file name.
  }

  applyImportedContent(parsedName, text)
}

async function onUnifiedImport(): Promise<void> {
  importUrl.value = ''
  importError.value = ''
  importLoading.value = false
  useJinaMode.value = false
  saveFocus()
  showImportModal.value = true
  void focusModalContent(importModalRef.value)
}

function closeImportModal(): void {
  importAbortController.value?.abort()
  importAbortController.value = null
  restoreFocus()
  showImportModal.value = false
  importLoading.value = false
}

async function onImportFromUrl(): Promise<void> {
  const raw = importUrl.value.trim()
  if (!raw) {
    importError.value = t('importUrlRequired')
    return
  }
  const normalizedUrl = normalizeImportUrl(raw)
  if (!normalizedUrl) {
    importError.value = t('importInvalidUrl')
    return
  }

  importLoading.value = true
  importError.value = ''
  try {
    await importFromUrl(normalizedUrl)
    closeImportModal()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      importError.value = t('importTimeout')
    } else if (error instanceof Error && error.message === 'too-large') {
      importError.value = t('importTooLarge', { max: formatBytes(MAX_IMPORT_BYTES) })
    } else {
      importError.value = t('importFailed')
    }
  } finally {
    importLoading.value = false
  }
}

function onPickLocalFile(): void {
  importError.value = ''
  localFileInputRef.value?.click()
}

async function onLocalFileChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (file.size > MAX_IMPORT_BYTES) {
    importError.value = t('importTooLarge', { max: formatBytes(MAX_IMPORT_BYTES) })
    target.value = ''
    return
  }

  // 拒绝明显的二进制文件类型
  if (file.type && !file.type.startsWith('text/') && !isTextMime(file.type)) {
    importError.value = t('importUnsupportedType')
    target.value = ''
    return
  }

  importLoading.value = true
  importError.value = ''
  try {
    const text = await file.text()
    applyImportedContent(file.name, text)
    closeImportModal()
  } catch {
    importError.value = t('importLocalFailed')
  } finally {
    importLoading.value = false
    target.value = ''
  }
}

/** 已知文本类 MIME 白名单（type 属性可能为 application/* 但内容为文本） */
function isTextMime(mime: string): boolean {
  return (
    mime.startsWith('application/json') ||
    mime.startsWith('application/xml') ||
    mime.startsWith('application/x-httpd-php') ||
    mime.startsWith('application/javascript') ||
    mime === 'application/x-sh' ||
    mime === 'application/typescript'
  )
}
</script>

<template>
  <div class="page">
    <main class="app">
      <header class="top-bar">
        <div class="brand">
          <button
            v-if="authStore.isLoggedIn"
            type="button"
            class="icon-btn mobile-files-btn"
            :aria-label="t('files')"
            @click="ui.sidebarOpen = true"
          >
            <IconMenu2 :size="18" :stroke-width="1.5" />
          </button>
          <span class="brand-logo" aria-hidden="true">
            <IconFile :size="16" :stroke-width="1.8" />
          </span>
          <span class="brand-name">{{ t('title') }}</span>
        </div>

        <div class="top-actions">
          <button
            type="button"
            class="icon-btn"
            :aria-label="t('importSource')"
            :title="t('importSource')"
            @click="onUnifiedImport"
          >
            <IconUpload :size="18" :stroke-width="1.5" />
          </button>

          <button
            type="button"
            class="icon-btn"
            :aria-label="t('theme')"
            :aria-pressed="themeMode === 'dark'"
            @click="toggleTheme"
          >
            <IconSun v-if="themeMode === 'light'" :size="18" :stroke-width="1.5" />
            <IconMoon v-else :size="18" :stroke-width="1.5" />
          </button>

          <button
            type="button"
            class="icon-btn"
            :class="{ active: privacyMode }"
            :aria-label="privacyMode ? t('privacyModeOn') : t('privacyModeOff')"
            :title="privacyMode ? t('privacyModeOn') : t('privacyModeOff')"
            :aria-pressed="privacyMode"
            @click="togglePrivacyMode"
          >
            <IconShieldCheck :size="18" :stroke-width="1.5" />
          </button>

          <button
            type="button"
            class="icon-btn"
            :aria-label="t('language')"
            :aria-pressed="activeLocale === 'en-US'"
            @click="toggleLocale"
          >
            <IconWorld :size="18" :stroke-width="1.5" />
          </button>

          <button
            type="button"
            class="icon-btn"
            :aria-label="t('about')"
            :title="t('about')"
            @click="openAboutModal"
          >
            <IconInfoCircle :size="18" :stroke-width="1.5" />
          </button>

          <template v-if="!authStore.isLoggedIn">
            <span class="top-actions-divider" aria-hidden="true"></span>
            <button type="button" class="login-btn" @click="ui.openAuthModal()">
              <IconUser :size="16" :stroke-width="1.5" />
              <span>{{ t('login') }}</span>
            </button>
          </template>
        </div>
      </header>

      <header class="toolbar">
        <div class="doc-fields">
          <input
            id="file-name"
            v-model="fileName"
            class="doc-name"
            type="text"
            :placeholder="t('fileNamePlaceholder')"
            :aria-label="t('fileName')"
          />

          <div ref="fileTypeMenuRef" class="custom-select">
            <button
              id="file-type-trigger"
              type="button"
              class="select-trigger"
              :aria-label="t('fileType')"
              :aria-expanded="showFileTypeMenu"
              @click="toggleFileTypeMenu"
            >
              .{{ ext }} ({{ fileTypeLabel(ext) }})
            </button>

            <ul v-if="showFileTypeMenu" class="select-menu" role="listbox">
              <li v-for="item in FILE_TYPES" :key="item.ext">
                <button
                  type="button"
                  class="select-option"
                  :class="{ active: ext === item.ext }"
                  @click="selectFileType(item.ext)"
                >
                  .{{ item.ext }} ({{ fileTypeLabel(item.ext) }})
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div class="toolbar-actions">
          <!-- 保存到云端按钮（登录后显示） -->
          <button
            v-if="authStore.isLoggedIn"
            type="button"
            class="btn-primary action-with-icon"
            @click="onSaveToCloud"
          >
            <IconDeviceFloppy :size="16" :stroke-width="1.5" class="btn-icon" />
            <span>保存</span>
          </button>

          <button
            type="button"
            :class="[authStore.isLoggedIn ? 'btn-outline' : 'btn-primary', 'action-with-icon']"
            @click="onDownload"
          >
            <IconDownload :size="16" :stroke-width="1.5" class="btn-icon" />
            <span>{{ t('download') }}</span>
          </button>

          <button type="button" class="btn-ghost action-with-icon" @click="onClearDraft">
            <IconTrash :size="16" :stroke-width="1.5" class="btn-icon" />
            <span>{{ t('clearDraft') }}</span>
          </button>
        </div>
      </header>

      <section class="editor-wrap">
        <CodeEditor v-model="content" :ext="ext" :font-size="editorFontSize" />

        <div class="font-size-slider" :aria-label="t('fontSize')">
          <IconTypography :size="15" :stroke-width="1.5" class="font-slider-icon" />
          <input
            type="range"
            class="font-slider-input"
            :min="MIN_FONT_SIZE"
            :max="MAX_FONT_SIZE"
            :value="editorFontSize"
            :aria-label="t('fontSize')"
            @input="editorFontSize = Number(($event.target as HTMLInputElement).value)"
          />
          <span class="font-slider-value">{{ editorFontSize }}</span>
        </div>
      </section>
    </main>

    <div
      v-if="showImportModal"
      class="modal-mask"
      role="presentation"
      @click.self="closeImportModal"
    >
      <div
        ref="importModalRef"
        class="import-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('importDialogTitle')"
        @keydown="importModalRef && trapFocus($event, importModalRef)"
      >
        <h3 class="import-title">{{ t('importDialogTitle') }}</h3>
        <p class="import-desc">{{ t('importDialogDesc') }}</p>

        <label class="import-label" for="import-url">{{ t('importUrlLabel') }}</label>
        <input
          id="import-url"
          v-model="importUrl"
          class="import-input"
          type="url"
          :placeholder="t('importUrlPlaceholder')"
          @keydown.enter.prevent="onImportFromUrl"
        />

        <label class="import-switch">
          <input v-model="useJinaMode" type="checkbox" />
          <span>{{ t('importUseJina') }}</span>
        </label>

        <p v-if="importError" class="import-error">{{ importError }}</p>

        <div class="import-actions">
          <button type="button" class="modal-btn secondary" @click="onPickLocalFile">
            {{ t('chooseLocalFile') }}
          </button>
          <button
            type="button"
            class="modal-btn primary"
            :disabled="importLoading"
            @click="onImportFromUrl"
          >
            {{ importLoading ? t('importing') : t('loadFromUrl') }}
          </button>
          <button type="button" class="modal-btn secondary" @click="closeImportModal">
            {{ t('cancel') }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="showAboutModal"
      class="modal-mask"
      role="presentation"
      @click.self="closeAboutModal"
    >
      <div
        ref="aboutModalRef"
        class="import-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('aboutTitle')"
        @keydown="aboutModalRef && trapFocus($event, aboutModalRef)"
      >
        <h3 class="import-title">{{ t('aboutTitle') }}</h3>
        <p class="import-desc">{{ t('aboutDesc') }}</p>
        <div class="about-content">
          <p>{{ t('version') }}</p>
          <p>{{ t('lastUpdated') }}</p>
          <p>{{ t('footerCredit') }}</p>
          <p>
            {{ t('licenseNotice') }}
            <a
              class="license-link"
              href="https://www.gnu.org/licenses/agpl-3.0.html"
              target="_blank"
              rel="noreferrer"
            >
              {{ t('licenseName') }}
            </a>
          </p>
        </div>
        <div class="import-actions">
          <button type="button" class="modal-btn primary" @click="closeAboutModal">
            {{ t('confirm') }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="showPrivacyModal"
      class="modal-mask"
      role="presentation"
      @click.self="closePrivacyModal"
    >
      <div
        ref="privacyModalRef"
        class="import-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('privacyDialogTitle')"
        @keydown="privacyModalRef && trapFocus($event, privacyModalRef)"
      >
        <h3 class="import-title">{{ t('privacyDialogTitle') }}</h3>
        <p class="import-desc">{{ t('privacyDialogDesc') }}</p>

        <ul class="privacy-list">
          <li>{{ t('privacyPoint1') }}</li>
          <li>{{ t('privacyPoint2') }}</li>
          <li>{{ t('privacyPoint3') }}</li>
        </ul>

        <div class="import-actions">
          <button type="button" class="modal-btn secondary" @click="closePrivacyModal">
            {{ t('cancel') }}
          </button>
          <button type="button" class="modal-btn primary" @click="confirmPrivacyMode">
            {{ pendingPrivacyMode ? t('privacyEnable') : t('privacyDisable') }}
          </button>
        </div>
      </div>
    </div>

    <input
      ref="localFileInputRef"
      class="hidden-file-input"
      type="file"
      @change="onLocalFileChange"
    />
  </div>
</template>
