import { useMemo, useState } from 'react'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import type { TeacherWorkload } from '@shared/types/entities'

interface WorkloadPanelProps {
  workloads: TeacherWorkload[]
  /** 高亮：当前选区涉及的教师 */
  highlightTeacherIds?: number[]
}

/**
 * 教师工作量实时看板（docs/05 §4.2 右侧固定面板）。
 * 超限者红色闪烁置顶；未派课的教师折叠到「待分配」区，避免长列表淹没重点。
 */
export function WorkloadPanel({
  workloads,
  highlightTeacherIds = []
}: WorkloadPanelProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const highlight = useMemo(() => new Set(highlightTeacherIds), [highlightTeacherIds])

  const stats = useMemo(() => {
    const active = workloads.filter((w) => w.assignedPeriods > 0)
    const over = workloads.filter((w) => w.over)
    const total = workloads.reduce((s, w) => s + w.assignedPeriods, 0)
    const avg = active.length > 0 ? total / active.length : 0
    return { activeCount: active.length, overCount: over.length, total, avg }
  }, [workloads])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return workloads
      .filter((w) => (q === '' ? true : w.name.toLowerCase().includes(q)))
      .filter((w) => (onlyIssues ? w.over : true))
      .sort((a, b) => {
        if (a.over !== b.over) return a.over ? -1 : 1
        return b.assignedPeriods - a.assignedPeriods
      })
  }, [workloads, query, onlyIssues])

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">教师工作量</h3>
        {stats.overCount > 0 ? (
          <Badge tone="red" className="animate-pulse">
            {stats.overCount} 人超限
          </Badge>
        ) : (
          <Badge tone="green">无超限</Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="已派课" value={stats.activeCount} />
        <Stat label="总课时" value={stats.total} />
        <Stat label="人均" value={stats.avg.toFixed(1)} />
      </div>

      <Input
        placeholder="搜索教师…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-8 text-xs"
      />
      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[color:var(--text-secondary)]">
        <input
          type="checkbox"
          checked={onlyIssues}
          onChange={(e) => setOnlyIssues(e.target.checked)}
          className="h-3.5 w-3.5 accent-brand-600"
        />
        只看超限
      </label>

      <ul className="flex max-h-[46vh] flex-col gap-1 overflow-y-auto pr-1">
        {list.length === 0 && (
          <li className="py-6 text-center text-xs text-[color:var(--text-secondary)]">
            没有匹配的教师
          </li>
        )}
        {list.map((w) => {
          const pct = w.maxWeeklyPeriods > 0 ? (w.assignedPeriods / w.maxWeeklyPeriods) * 100 : 0
          return (
            <li
              key={w.teacherId}
              className={cn(
                'rounded-btn px-2 py-1.5 transition-colors',
                highlight.has(w.teacherId) && 'bg-brand-50 dark:bg-slate-800',
                w.over && 'bg-red-50/70 dark:bg-red-950/30'
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    'truncate text-xs font-medium',
                    w.over && 'text-red-700 dark:text-red-300'
                  )}
                  title={`${w.name} · 带 ${w.classCount} 个班`}
                >
                  {w.name}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-[11px] tabular-nums',
                    w.over
                      ? 'font-semibold text-red-600 dark:text-red-300'
                      : 'text-[color:var(--text-secondary)]'
                  )}
                >
                  {w.assignedPeriods}/{w.maxWeeklyPeriods}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300 ease-std',
                    w.over
                      ? 'animate-pulse bg-red-500'
                      : pct > 85
                        ? 'bg-amber-500'
                        : pct > 0
                          ? 'bg-brand-600'
                          : 'bg-transparent'
                  )}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

function Stat({ label, value }: { label: string; value: number | string }): React.JSX.Element {
  return (
    <div className="rounded-btn bg-slate-100 py-1.5 dark:bg-slate-800">
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-[color:var(--text-secondary)]">{label}</div>
    </div>
  )
}
