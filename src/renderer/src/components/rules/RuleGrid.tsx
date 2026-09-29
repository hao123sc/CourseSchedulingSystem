import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  RULE_BRUSH_ORDER,
  RULE_VALUE_META,
  SEGMENTS,
  WEEKDAY_NAMES,
  labelOf,
  type RuleValue,
  type Segment
} from '@shared/domain'
import type { TimeSlot } from '@shared/types/entities'

interface RuleGridProps {
  /** 某学段的全部时段（含非教学占位） */
  slots: TimeSlot[]
  daysPerWeek: number
  /** slotId → 规则值；缺省即 NORMAL */
  rules: Map<number, RuleValue>
  brush: RuleValue
  onBrushChange: (v: RuleValue) => void
  /** 拖刷结束时一次性提交（避免每格一次 IPC） */
  onPaint: (slotIds: number[], value: RuleValue) => void
  disabled?: boolean
}

interface PeriodRow {
  periodIndex: number
  periodName: string
  segment: Segment
  isTeaching: boolean
  /** dayOfWeek → slot */
  byDay: Map<number, TimeSlot>
}

/**
 * 四层规则值调色网格（docs/05 §4.3，决策 D4）。
 *
 * - 选画笔后**按住拖刷**，像画图工具一样刷一片区域（拖动过程实时预览，松手才落库）
 * - 上午 / 下午 / 晚自习之间有视觉分隔带
 * - 点行首「第 N 节」刷整行，点列头「周 X」刷整列，点左上角刷全表
 */
export function RuleGrid({
  slots,
  daysPerWeek,
  rules,
  brush,
  onBrushChange,
  onPaint,
  disabled = false
}: RuleGridProps): React.JSX.Element {
  const painting = useRef(false)
  const [preview, setPreview] = useState<Map<number, RuleValue>>(new Map())
  const pendingRef = useRef<Set<number>>(new Set())

  const periods: PeriodRow[] = useMemo(() => {
    const map = new Map<number, PeriodRow>()
    for (const s of slots) {
      if (s.dayOfWeek > daysPerWeek) continue
      let row = map.get(s.periodIndex)
      if (!row) {
        row = {
          periodIndex: s.periodIndex,
          periodName: s.periodName,
          segment: s.segment,
          isTeaching: s.isTeaching,
          byDay: new Map()
        }
        map.set(s.periodIndex, row)
      }
      row.byDay.set(s.dayOfWeek, s)
    }
    return [...map.values()].sort((a, b) => a.periodIndex - b.periodIndex)
  }, [slots, daysPerWeek])

  const days = useMemo(() => Array.from({ length: daysPerWeek }, (_, i) => i + 1), [daysPerWeek])

  const commit = (): void => {
    const ids = [...pendingRef.current]
    pendingRef.current = new Set()
    setPreview(new Map())
    painting.current = false
    if (ids.length > 0) onPaint(ids, brush)
  }

  useEffect(() => {
    const up = (): void => {
      if (painting.current) commit()
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  })

  const paintSlots = (ids: number[]): void => {
    if (disabled) return
    const next = new Map(preview)
    for (const id of ids) {
      pendingRef.current.add(id)
      next.set(id, brush)
    }
    setPreview(next)
  }

  const valueOf = (slotId: number): RuleValue =>
    preview.get(slotId) ?? rules.get(slotId) ?? 'NORMAL'

  const counts = useMemo(() => {
    const c: Record<RuleValue, number> = { NORMAL: 0, PREFERRED: 0, AVOID: 0, FORBIDDEN: 0 }
    for (const p of periods) {
      for (const d of days) {
        const s = p.byDay.get(d)
        if (!s) continue
        c[valueOf(s.id)] += 1
      }
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periods, days, rules, preview])

  if (periods.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-card border border-dashed border-[color:var(--border-subtle)] text-sm text-[color:var(--text-secondary)]">
        该学段还没有配置作息 —— 请先到「学校设置 → 学段与作息」定义节次
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 画笔 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[color:var(--text-secondary)]">规则值画笔</span>
        {RULE_BRUSH_ORDER.map((v) => {
          const m = RULE_VALUE_META[v]
          const active = brush === v
          return (
            <button
              key={v}
              type="button"
              onClick={() => onBrushChange(v)}
              title={m.hint}
              className={cn(
                'flex items-center gap-1.5 rounded-btn border px-2.5 py-1 text-xs font-medium transition-all',
                active
                  ? 'border-brand-600 ring-2 ring-brand-600/30'
                  : 'border-[color:var(--border-subtle)] hover:border-slate-400'
              )}
            >
              <span
                className="h-3 w-3 rounded-sm border"
                style={{ backgroundColor: m.bg, borderColor: m.border }}
              />
              {m.label}
              <span className="tabular-nums opacity-50">{counts[v]}</span>
            </button>
          )
        })}
        <span className="ml-auto text-[11px] text-[color:var(--text-secondary)]">
          按住左键拖动可连续刷；点行首 / 列头 / 左上角可整行 / 整列 / 全表刷
        </span>
      </div>

      {/* 网格 */}
      <div
        className={cn(
          'inline-block select-none overflow-hidden rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)]',
          disabled && 'pointer-events-none opacity-60'
        )}
      >
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th
                className="w-24 cursor-pointer border-b border-r border-[color:var(--border-subtle)] px-2 py-2 text-left font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                title="点击刷满全表"
                onClick={() => {
                  const ids: number[] = []
                  for (const p of periods)
                    for (const d of days) {
                      const s = p.byDay.get(d)
                      if (s) ids.push(s.id)
                    }
                  if (!disabled) onPaint(ids, brush)
                }}
              >
                节次 \ 星期
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className="w-20 cursor-pointer border-b border-r border-[color:var(--border-subtle)] px-2 py-2 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={`点击刷满周${WEEKDAY_NAMES[d - 1]}整列`}
                  onClick={() => {
                    const ids = periods
                      .map((p) => p.byDay.get(d))
                      .filter((s): s is TimeSlot => s != null)
                      .map((s) => s.id)
                    if (!disabled) onPaint(ids, brush)
                  }}
                >
                  周{WEEKDAY_NAMES[d - 1]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((p, i) => {
              const prev = periods[i - 1]
              const segmentBreak = prev != null && prev.segment !== p.segment
              return (
                <tr key={p.periodIndex}>
                  <th
                    className={cn(
                      'cursor-pointer border-b border-r border-[color:var(--border-subtle)] px-2 py-1 text-left font-medium hover:bg-slate-100 dark:hover:bg-slate-800',
                      segmentBreak && 'border-t-4 border-t-slate-200 dark:border-t-slate-700'
                    )}
                    title={`点击刷满${p.periodName}整行`}
                    onClick={() => {
                      const ids = days
                        .map((d) => p.byDay.get(d))
                        .filter((s): s is TimeSlot => s != null)
                        .map((s) => s.id)
                      if (!disabled) onPaint(ids, brush)
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{p.periodName}</span>
                      {segmentBreak && (
                        <span className="shrink-0 rounded bg-slate-100 px-1 text-[9px] text-[color:var(--text-secondary)] dark:bg-slate-700">
                          {labelOf(SEGMENTS, p.segment)}
                        </span>
                      )}
                    </div>
                  </th>
                  {days.map((d) => {
                    const slot = p.byDay.get(d)
                    if (!slot) {
                      return (
                        <td
                          key={d}
                          className={cn(
                            'border-b border-r border-[color:var(--border-subtle)] bg-slate-50 dark:bg-slate-900',
                            segmentBreak && 'border-t-4 border-t-slate-200 dark:border-t-slate-700'
                          )}
                        />
                      )
                    }
                    const v = valueOf(slot.id)
                    const m = RULE_VALUE_META[v]
                    const nonTeaching = !slot.isTeaching
                    return (
                      <td
                        key={d}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return
                          e.preventDefault()
                          painting.current = true
                          paintSlots([slot.id])
                        }}
                        onMouseEnter={() => {
                          if (painting.current) paintSlots([slot.id])
                        }}
                        className={cn(
                          'h-8 cursor-crosshair border-b border-r border-[color:var(--border-subtle)] text-center transition-colors',
                          segmentBreak && 'border-t-4 border-t-slate-200 dark:border-t-slate-700',
                          nonTeaching && 'opacity-50'
                        )}
                        style={{ backgroundColor: m.bg, color: m.text }}
                        title={`${slot.periodName} 周${WEEKDAY_NAMES[d - 1]}${
                          nonTeaching ? '（非教学时段）' : ''
                        } · ${m.label}`}
                      >
                        <span className="text-[11px] font-medium">
                          {v === 'NORMAL' ? '' : m.short}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
