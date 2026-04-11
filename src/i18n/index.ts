import { createI18n } from 'vue-i18n'
import enUS from '../locales/en-US'
import zhCN from '../locales/zh-CN'

export const LOCALE_STORAGE_KEY = 'file-builder-locale'

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS
} as const

export type AppLocale = keyof typeof messages

function safeGetStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function detectLocale(): AppLocale {
  const saved = safeGetStorage(LOCALE_STORAGE_KEY)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }

  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en-US',
  messages
})
