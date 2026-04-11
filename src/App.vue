<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import CodeEditor from './components/CodeEditor.vue'
import { FILE_TYPES, type FileExtension } from './constants/fileTypes'
import { LOCALE_STORAGE_KEY, type AppLocale } from './i18n'
import { buildFileName, downloadFile, getMimeType } from './utils/file'

const fileName = ref('untitled')
const ext = ref<FileExtension>('txt')
const content = ref('')

const { t, locale } = useI18n()
const THEME_STORAGE_KEY = 'file-builder-theme'

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

watch(
  () => activeLocale.value,
  (nextLocale) => {
    safeSetStorage(LOCALE_STORAGE_KEY, nextLocale)
  }
)

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
  const finalFileName = buildFileName(fileName.value, ext.value)
  const mime = getMimeType(ext.value)
  downloadFile(content.value, finalFileName, mime)
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
  </div>
</template>
