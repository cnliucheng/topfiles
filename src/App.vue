<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

const { t, locale } = useI18n()
const THEME_STORAGE_KEY = 'file-builder-theme'
const DRAFT_STORAGE_KEY = 'file-builder-draft-v1'

type ThemeMode = 'light' | 'dark'
const themeMode = ref<ThemeMode>('light')

const activeLocale = computed({
  get: () => locale.value as AppLocale,
  set: (value: AppLocale) => {
    locale.value = value
  }
})

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
  const raw = safeGetStorage(DRAFT_STORAGE_KEY)
  if (!raw) return

  try {
    const parsed = JSON.parse(raw) as Partial<{
      fileName: string
      ext: string
      content: string
    }>
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
  safeSetStorage(
    DRAFT_STORAGE_KEY,
    JSON.stringify({
      fileName: fileName.value,
      ext: ext.value,
      content: content.value
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
    const response = await fetch(toJinaUrl(url))
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const raw = await response.text()
    return stripJinaHeader(raw)
  }

  const candidates = buildImportCandidates(url)
  let lastError: unknown = null

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return await response.text()
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
  const url = importUrl.value.trim()
  if (!url) {
    importError.value = t('importUrlRequired')
    return
  }

  importLoading.value = true
  importError.value = ''
  try {
    await importFromUrl(url)
    closeImportModal()
  } catch {
    importError.value = t('importFailed')
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
              <path d="M4 6H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              <path
                d="M9 6C9 11 7 15.2 4 18"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
              <path
                d="M7 11C8.3 13.3 10.1 15.4 12.3 17"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
              <path
                d="M15 18L17.1 12.4L19.2 18"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
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
          <label for="file-type">{{ t('fileType') }}</label>
          <select id="file-type" v-model="ext">
            <option v-for="item in FILE_TYPES" :key="item.ext" :value="item.ext">
              .{{ item.ext }} ({{ t(`fileTypes.${item.ext}`) }})
            </option>
          </select>
        </div>

        <button type="button" class="download-btn" @click="onDownload">
          {{ t('download') }}
        </button>

        <button type="button" class="secondary-btn" @click="onClearDraft">
          {{ t('clearDraft') }}
        </button>
      </header>

      <section class="editor-wrap">
        <CodeEditor v-model="content" :ext="ext" />
      </section>

      <footer class="app-footer">
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
      </footer>
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

    <input
      ref="localFileInputRef"
      class="hidden-file-input"
      type="file"
      @change="onLocalFileChange"
    />
  </div>
</template>
