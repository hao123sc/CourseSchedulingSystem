import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'zhikepai:theme'

function readInitialTheme(): Theme {
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeClass(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const initial = readInitialTheme()
applyThemeClass(initial)

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initial,
  toggleTheme: () => {
    const next: Theme = get().theme === 'light' ? 'dark' : 'light'
    window.localStorage.setItem(STORAGE_KEY, next)
    applyThemeClass(next)
    set({ theme: next })
  },
  setTheme: (theme) => {
    window.localStorage.setItem(STORAGE_KEY, theme)
    applyThemeClass(theme)
    set({ theme })
  }
}))
