import { Button } from '@renderer/components/ui/button'
import { useThemeStore } from '@renderer/stores/themeStore'
import { useSchoolStore } from '@renderer/stores/schoolStore'

export function Topbar(): React.JSX.Element {
  const { theme, toggleTheme } = useThemeStore()
  const school = useSchoolStore((s) => s.school)
  const currentSemester = useSchoolStore((s) => s.currentSemester)

  const label =
    [school?.name, currentSemester?.name].filter(Boolean).join(' · ') || '未设置学校与学期'

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6">
      <div className="text-sm text-[color:var(--text-secondary)]">{label}</div>
      <Button variant="outline" size="sm" onClick={toggleTheme}>
        {theme === 'light' ? '🌙 深色模式' : '☀️ 浅色模式'}
      </Button>
    </header>
  )
}
