<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import CodeEditor from './components/CodeEditor.vue'
import { FILE_TYPES, type FileExtension } from './constants/fileTypes'
import { LOCALE_STORAGE_KEY, type AppLocale } from './i18n'
import { buildFileName, downloadFile, getMimeType, inferSupportedExtension } from './utils/file'

const fileName = ref('untitled')
const ext = ref<FileExtension>('txt')
const content = ref('')
const localFileInputRef = ref<HTMLInputElement | null>(null)
const showImportModal = ref(false)
const importUrl = ref('')
const importError = ref('')
const importLoading = ref(false)
const useJinaMode = ref(false)
const privacyMode = ref(false)
const showPrivacyModal = ref(false)
const pendingPrivacyMode = ref(false)
const showAboutModal = ref(false)
const showFileTypeMenu = ref(false)
const fileTypeMenuRef = ref<HTMLElement | null>(null)

const { t, locale } = useI18n()
const THEME_STORAGE_KEY = 'file-builder-theme'
const DRAFT_STORAGE_KEY = 'file-builder-draft-v1'
const PRIVACY_MODE_KEY = 'file-builder-privacy-mode-v1'
const FONT_SIZE_KEY = 'file-builder-font-size-v1'
const MAX_IMPORT_BYTES = 2 * 1024 * 1024
const IMPORT_TIMEOUT_MS = 12_000
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MIN_FONT_SIZE = 11
const MAX_FONT_SIZE = 20

type ThemeMode = 'light' | 'dark'
const themeMode = ref<ThemeMode>('light')

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

  safeSetStorage(
    DRAFT_STORAGE_KEY,
    JSON.stringify({
      fileName: fileName.value,
      ext: ext.value,
      content: content.value,
      savedAt: Date.now()
    })
  )
}

watch(
  () => activeLocale.value,
  (nextLocale) => {
    safeSetStorage(LOCALE_STORAGE_KEY, nextLocale)
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

watch([fileName, ext, content], () => {
  saveDraft()
})

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
})

function detectTheme(): ThemeMode {
  const saved = safeGetStorage(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', mode)
}

themeMode.value = detectTheme()
applyTheme(themeMode.value)

watch(
  () => themeMode.value,
  (nextTheme) => {
    safeSetStorage(THEME_STORAGE_KEY, nextTheme)
    applyTheme(nextTheme)
  }
)

function toggleTheme(): void {
  themeMode.value = themeMode.value === 'light' ? 'dark' : 'light'
}

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

function decreaseFontSize(): void {
  editorFontSize.value = Math.max(MIN_FONT_SIZE, editorFontSize.value - 1)
}

function increaseFontSize(): void {
  editorFontSize.value = Math.min(MAX_FONT_SIZE, editorFontSize.value + 1)
}

function onDownload(): void {
  const detectedExt = inferSupportedExtension(fileName.value)
  const finalExt = detectedExt ?? ext.value
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
  showPrivacyModal.value = true
}

function closePrivacyModal(): void {
  showPrivacyModal.value = false
}

function confirmPrivacyMode(): void {
  privacyMode.value = pendingPrivacyMode.value
  showPrivacyModal.value = false
}

function openAboutModal(): void {
  showAboutModal.value = true
}

function closeAboutModal(): void {
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
    `https://cors.isomorphic-git.org/${url}`
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
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
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
  const marker = 'Markdown Content:\n'
  const markerIndex = normalized.indexOf(marker)
  if (markerIndex >= 0) {
    return normalized.slice(markerIndex + marker.length).trimStart()
  }

  const lines = normalized.split('\n')
  const urlSourceIndex = lines.findIndex((line) => line.startsWith('URL Source:'))
  if (urlSourceIndex >= 0) {
    const firstContent = lines.findIndex((line, idx) => idx > urlSourceIndex && line.trim() !== '')
    if (firstContent > -1) return lines.slice(firstContent).join('\n')
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
  showImportModal.value = true
}

function closeImportModal(): void {
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

  importLoading.value = true
  importError.value = ''
  try {
    const text = await file.text()
    applyImportedContent(file.name, text)
    closeImportModal()
  } catch {
    importError.value = t('importFailed')
  } finally {
    importLoading.value = false
    target.value = ''
  }
}
</script>

<template>
  <div class="page">
    <main class="app">
      <header class="top-bar">
        <div class="brand">
          <span class="brand-logo" aria-hidden="true">F</span>
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
            <svg
              class="icon-svg"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M12 14V4"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
              <path
                d="M8.5 7.5L12 4L15.5 7.5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M4 14.5V17C4 18.1 4.9 19 6 19H18C19.1 19 20 18.1 20 17V14.5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </button>

          <button
            type="button"
            class="icon-btn"
            :aria-label="t('theme')"
            :aria-pressed="themeMode === 'dark'"
            @click="toggleTheme"
          >
            <svg
              v-if="themeMode === 'light'"
              class="icon-svg"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" />
              <path d="M12 2.5V5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <path d="M12 19V21.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <path d="M2.5 12H5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <path d="M19 12H21.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <path d="M5.3 5.3L7.1 7.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <path d="M16.9 16.9L18.7 18.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <path d="M16.9 7.1L18.7 5.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <path d="M5.3 18.7L7.1 16.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            <svg
              v-else
              class="icon-svg"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M20.5 14.2C19.3 14.9 17.9 15.3 16.4 15.3C12 15.3 8.5 11.8 8.5 7.4C8.5 5.9 8.9 4.5 9.6 3.3C5.8 4.3 3 7.7 3 11.8C3 16.7 7 20.7 11.9 20.7C16 20.7 19.4 17.9 20.5 14.2Z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
            </svg>
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
            <svg
              class="icon-svg"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M12 3L5 6V11.3C5 15.8 7.9 19.9 12 21C16.1 19.9 19 15.8 19 11.3V6L12 3Z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
              <path
                d="M9.3 12.2L11 13.9L14.8 10.1"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span class="icon-state-badge">{{ privacyMode ? 'ON' : 'OFF' }}</span>
          </button>

          <div class="font-size-control" :aria-label="t('fontSize')">
            <button
              type="button"
              class="icon-btn"
              :aria-label="t('fontSmaller')"
              :title="t('fontSmaller')"
              @click="decreaseFontSize"
            >
              <span class="font-symbol">A-</span>
            </button>
            <span class="font-size-value">{{ editorFontSize }}</span>
            <button
              type="button"
              class="icon-btn"
              :aria-label="t('fontLarger')"
              :title="t('fontLarger')"
              @click="increaseFontSize"
            >
              <span class="font-symbol">A+</span>
            </button>
          </div>

          <button
            type="button"
            class="icon-btn"
            :aria-label="t('language')"
            :aria-pressed="activeLocale === 'en-US'"
            @click="toggleLocale"
          >
            <svg
              class="icon-svg"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
              <path
                d="M3.6 9H20.4"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
              <path
                d="M3.6 15H20.4"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
              <path
                d="M12 3.2C14 5.4 15.2 8.5 15.2 12C15.2 15.5 14 18.6 12 20.8"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M12 3.2C10 5.4 8.8 8.5 8.8 12C8.8 15.5 10 18.6 12 20.8"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            class="icon-btn"
            :aria-label="t('about')"
            :title="t('about')"
            @click="openAboutModal"
          >
            <svg
              class="icon-svg"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
              <path d="M12 10.2V16.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <circle cx="12" cy="7.2" r="1" fill="currentColor" />
            </svg>
          </button>
        </div>
      </header>

      <header class="toolbar">
        <div class="field file-name-field">
          <label for="file-name">{{ t('fileName') }}</label>
          <input
            id="file-name"
            v-model="fileName"
            type="text"
            :placeholder="t('fileNamePlaceholder')"
          />
        </div>

        <div class="field">
          <label for="file-type-trigger">{{ t('fileType') }}</label>
          <div ref="fileTypeMenuRef" class="custom-select">
            <button
              id="file-type-trigger"
              type="button"
              class="select-trigger"
              :aria-expanded="showFileTypeMenu"
              @click="toggleFileTypeMenu"
            >
              .{{ ext }} ({{ t(`fileTypes.${ext}`) }})
            </button>

            <ul v-if="showFileTypeMenu" class="select-menu" role="listbox">
              <li v-for="item in FILE_TYPES" :key="item.ext">
                <button
                  type="button"
                  class="select-option"
                  :class="{ active: ext === item.ext }"
                  @click="selectFileType(item.ext)"
                >
                  .{{ item.ext }} ({{ t(`fileTypes.${item.ext}`) }})
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div class="toolbar-actions">
          <button type="button" class="download-btn action-with-icon" @click="onDownload">
            <svg
              class="btn-icon"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M12 4V14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <path
                d="M8.5 10.5L12 14L15.5 10.5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M5 16.5V18C5 19.1 5.9 20 7 20H17C18.1 20 19 19.1 19 18V16.5"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
            <span>{{ t('download') }}</span>
          </button>

          <button type="button" class="secondary-btn action-with-icon" @click="onClearDraft">
            <svg
              class="btn-icon"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M4 7H20"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
              <path
                d="M9 7V5.8C9 4.8 9.8 4 10.8 4H13.2C14.2 4 15 4.8 15 5.8V7"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
              <path
                d="M7.2 7L8 18C8.1 19.1 9 20 10.1 20H13.9C15 20 15.9 19.1 16 18L16.8 7"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
            <span>{{ t('clearDraft') }}</span>
          </button>
        </div>
      </header>

      <section class="editor-wrap">
        <CodeEditor v-model="content" :ext="ext" :font-size="editorFontSize" />
      </section>
    </main>

    <div
      v-if="showImportModal"
      class="modal-mask"
      role="presentation"
      @click.self="closeImportModal"
    >
      <div class="import-modal" role="dialog" aria-modal="true" :aria-label="t('importDialogTitle')">
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
      <div class="import-modal" role="dialog" aria-modal="true" :aria-label="t('aboutTitle')">
        <h3 class="import-title">{{ t('aboutTitle') }}</h3>
        <p class="import-desc">{{ t('aboutDesc') }}</p>
        <div class="about-content">
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
      <div class="import-modal" role="dialog" aria-modal="true" :aria-label="t('privacyDialogTitle')">
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
