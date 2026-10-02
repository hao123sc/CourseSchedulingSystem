import { create } from 'zustand'

/**
 * 界面外壳状态：侧边栏折叠 + 界面缩放。
 *
 * 缩放的做法：Tailwind 的字号/间距/宽高绝大多数是 rem 单位，所以只要改根字号，
 * 整个界面（含表格行高、卡片内边距、侧边栏宽度）会**等比缩放**，
 * 比 Electron 的 webFrame zoom 更可控，而且浏览器预览模式下同样有效。
 */
const SCALE_KEY = 'zhikepai.ui.scale'
const COLLAPSE_KEY = 'zhikepai.ui.sidebarCollapsed'
const BASE_FONT_SIZE = 16

export const SCALE_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const
export const MIN_SCALE = SCALE_STEPS[0]
export const MAX_SCALE = SCALE_STEPS[SCALE_STEPS.length - 1]

function readScale(): number {
  const raw = Number(localStorage.getItem(SCALE_KEY))
  if (!Number.isFinite(raw) || raw <= 0) return 1
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw))
}

function applyScale(scale: number): void {
  document.documentElement.style.fontSize = `${BASE_FONT_SIZE * scale}px`
}

interface UiState {
  scale: number
  sidebarCollapsed: boolean
  setScale: (scale: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  toggleSidebar: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  scale: 1,
  sidebarCollapsed: false,

  setScale: (scale) => {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(scale.toFixed(2))))
    applyScale(next)
    localStorage.setItem(SCALE_KEY, String(next))
    set({ scale: next })
  },

  zoomIn: () => {
    const cur = get().scale
    const next = SCALE_STEPS.find((s) => s > cur + 0.001) ?? MAX_SCALE
    get().setScale(next)
  },

  zoomOut: () => {
    const cur = get().scale
    const next = [...SCALE_STEPS].reverse().find((s) => s < cur - 0.001) ?? MIN_SCALE
    get().setScale(next)
  },

  resetZoom: () => get().setScale(1),

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    set({ sidebarCollapsed: next })
  }
}))

/** 应用启动时恢复上次的缩放与折叠状态（在 main.tsx 里调用一次） */
export function initUiPreferences(): void {
  const scale = readScale()
  applyScale(scale)
  useUiStore.setState({
    scale,
    sidebarCollapsed: localStorage.getItem(COLLAPSE_KEY) === '1'
  })
}
