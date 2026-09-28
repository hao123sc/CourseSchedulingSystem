import { Button } from '@renderer/components/ui/button'
import { useThemeStore } from '@renderer/stores/themeStore'

export function Topbar(): React.JSX.Element {
  const { theme, toggleTheme } = useThemeStore()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6">
      <div className="text-sm text-[color:var(--text-secondary)]">
        示范学校 · 2026-2027 学年第一学期
      </div>
      <Button variant="outline" size="sm" onClick={toggleTheme}>
        {theme === 'light' ? '🌙 深色模式' : '☀️ 浅色模式'}
      </Button>
    </header>
  )
}
