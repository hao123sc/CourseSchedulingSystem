import { Button } from '@renderer/components/ui/button'
import { useThemeStore } from '@renderer/stores/themeStore'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { useUiStore, MIN_SCALE, MAX_SCALE } from '@renderer/stores/uiStore'

export function Topbar(): React.JSX.Element {
  const { theme, toggleTheme } = useThemeStore()
  const school = useSchoolStore((s) => s.school)
  const currentSemester = useSchoolStore((s) => s.currentSemester)
  const { scale, zoomIn, zoomOut, resetZoom, sidebarCollapsed, toggleSidebar } = useUiStore()

  const label =
    [school?.name, currentSemester?.name].filter(Boolean).join(' · ') || '未设置学校与学期'

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-3 lg:px-6">
      <button
        type="button"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏（窄屏可腾出空间）'}
        aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn text-[color:var(--text-secondary)] transition-colors hover:bg-slate-100 hover:text-[color:var(--text-primary)] dark:hover:bg-slate-800"
      >
        <span aria-hidden>{sidebarCollapsed ? '»' : '«'}</span>
      </button>

      {/* min-w-0 + truncate：学校名再长也不会把右侧按钮挤出窗口 */}
      <div
        className="min-w-0 flex-1 truncate text-sm text-[color:var(--text-secondary)]"
        title={label}
      >
        {label}
      </div>

      <div className="flex shrink-0 items-center gap-1 rounded-btn border border-[color:var(--border-subtle)] px-1 py-0.5">
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          title="缩小界面（Ctrl + -）"
          className="h-6 w-6 rounded text-sm leading-none text-[color:var(--text-secondary)] transition-colors hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetZoom}
          title="恢复 100%（Ctrl + 0）"
          className="min-w-[3rem] rounded px-1 text-xs tabular-nums text-[color:var(--text-secondary)] transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
          title="放大界面（Ctrl + =）"
          className="h-6 w-6 rounded text-sm leading-none text-[color:var(--text-secondary)] transition-colors hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
        >
          ＋
        </button>
      </div>

      <Button variant="outline" size="sm" className="shrink-0" onClick={toggleTheme}>
        <span className="hidden sm:inline">
          {theme === 'light' ? '🌙 深色模式' : '☀️ 浅色模式'}
        </span>
        <span className="sm:hidden">{theme === 'light' ? '🌙' : '☀️'}</span>
      </Button>
    </header>
  )
}
