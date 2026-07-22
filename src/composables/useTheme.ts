import { ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'app-theme'

// Module-level singleton — all components share the same reactive state
const themeMode = ref<ThemeMode>('light')
let initialized = false

function detectTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* storage unavailable */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', mode)
}

function persistTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch { /* storage unavailable */ }
}

export function useTheme() {
  if (!initialized) {
    initialized = true
    themeMode.value = detectTheme()
    applyTheme(themeMode.value)

    watch(themeMode, (mode) => {
      applyTheme(mode)
      persistTheme(mode)
    })
  }

  function toggleTheme(): void {
    themeMode.value = themeMode.value === 'light' ? 'dark' : 'light'
  }

  return { themeMode, toggleTheme }
}
