import { useMemo } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  RULE_VALUE_META,
  SEGMENTS,
  WEEKDAY_NAMES,
  labelOf,
  type RuleValue,
  type Segment
} from '@shared/domain'
import type { TimeSlot } from '@shared/types/entities'

/** 落在某一格里的一条占位 */
export interface GridEntry {
  id: number
  kind: 'lesson' | 'block'
  /** 主标题：教室视角给班级名，班级视角给学科名 */
  title: string
  /** 副标题：教师 / 备注 */
  subtitle?: string | null
  /** 命中冲突判定，画红框 */
  conflict?: boolean
  /** 只读（如班级视角里看到的整年级占位），点击给提示而非编辑 */
  readOnly?: boolean
}

/** 教室视角的班位占用统计 */
export interface CellStat {
  used: number
  cap: number
}

interface Props {
  slots: TimeSlot[]
  daysPerWeek: number
  /** slotId → 该格的占位 */
  entriesBySlot: Map<number, GridEntry[]>
  /** slotId → 有效规则值，用作格子底色；不传则不叠加 */
  ruleBySlot?: Map<number, RuleValue>
  /** 教室视角：该格已用班位 / 总并发容量 */
  statOf?: (slotId: number) => CellStat | null
  /** 其它学段在同一天同一节次上的占用，用角标提示 */
  crossStageOf?: (dayOfWeek: number, periodIndex: number) => { count: number; label: string } | null
  onCellClick: (slot: TimeSlot) => void
  onEntryClick: (entry: GridEntry, slot: TimeSlot) => void
}

interface PeriodRow {
  periodIndex: number
  periodName: string
  segment: Segment
  isTeaching: boolean
  byDay: Map<number, TimeSlot>
}

/**
 * 「某个资源」的一周课表网格：教室、教师、班级三种视角共用。
 *
 * 和 RuleGrid 的区别：RuleGrid 是拖刷调色，一格一个值；这里一格可以放多条占位
 * （田径场并发容量 4，一节课能同时站 4 个班），点空格新建、点条目编辑。
 * 时段规则的禁排 / 避排 / 优选作为**底色**叠在下面，让教务一眼看出
 * 哪些格子本来就不该排课，避免把预排落在禁排格上。
 */
export function ResourceScheduleGrid({
  slots,
  daysPerWeek,
  entriesBySlot,
  ruleBySlot,
  statOf,
  crossStageOf,
  onCellClick,
  onEntryClick
}: Props): React.JSX.Element {
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

  if (periods.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-card border border-dashed border-[color:var(--border-subtle)] text-sm text-[color:var(--text-secondary)]">
        该学段还没有配置作息 —— 请先到「学校设置 → 学段与作息」定义节次
      </div>
    )
  }

  return (
    <div className="w-fit max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)]">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-24 border-b border-r border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-2 py-2 text-left font-semibold">
              节次 \ 星期
            </th>
            {days.map((d) => (
              <th
                key={d}
                className="w-32 border-b border-r border-[color:var(--border-subtle)] px-2 py-2 font-semibold"
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
                    'sticky left-0 z-10 border-b border-r border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-2 py-1 text-left font-medium',
                    segmentBreak && 'border-t-4 border-t-slate-200 dark:border-t-slate-700'
                  )}
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
                  const entries = entriesBySlot.get(slot.id) ?? []
                  const rule = ruleBySlot?.get(slot.id) ?? 'NORMAL'
                  const ruleMeta = RULE_VALUE_META[rule]
                  const stat = statOf?.(slot.id) ?? null
                  const cross = crossStageOf?.(d, p.periodIndex) ?? null
                  const full = stat != null && stat.used >= stat.cap
                  return (
                    <td
                      key={d}
                      onClick={() => onCellClick(slot)}
                      title={[
                        `${p.periodName} 周${WEEKDAY_NAMES[d - 1]}`,
                        slot.isTeaching ? null : '非教学时段',
                        rule === 'NORMAL' ? null : `时段规则：${ruleMeta.label}`,
                        stat ? `班位 ${stat.used}/${stat.cap}` : null,
                        cross ? `${cross.label}同一格另有 ${cross.count} 处占用` : null,
                        entries.length === 0 ? '点击新增占位' : null
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      className={cn(
                        'relative h-14 cursor-pointer border-b border-r border-[color:var(--border-subtle)] p-1 align-top transition-colors',
                        segmentBreak && 'border-t-4 border-t-slate-200 dark:border-t-slate-700',
                        !slot.isTeaching && 'opacity-60',
                        entries.length === 0 && 'hover:bg-brand-50 dark:hover:bg-brand-600/10'
                      )}
                      style={rule === 'NORMAL' ? undefined : { backgroundColor: ruleMeta.bg }}
                    >
                      {/* 时段规则角标：提醒这一格本来就不该排 */}
                      {rule !== 'NORMAL' && (
                        <span
                          className="absolute left-0.5 top-0.5 rounded px-0.5 text-[9px] font-semibold leading-tight"
                          style={{ color: ruleMeta.text }}
                        >
                          {ruleMeta.short}
                        </span>
                      )}
                      {/* 并发容量：只在真有占用时提示还剩几个班位 */}
                      {stat != null && stat.cap > 1 && stat.used > 0 && (
                        <span
                          className={cn(
                            'absolute right-0.5 top-0.5 text-[9px] tabular-nums',
                            full
                              ? 'font-semibold text-amber-600'
                              : 'text-[color:var(--text-secondary)]'
                          )}
                        >
                          {stat.used}/{stat.cap}
                        </span>
                      )}
                      {/* 跨学段提示 */}
                      {cross != null && (
                        <span
                          className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-violet-500"
                          title={`${cross.label}同一格另有 ${cross.count} 处占用`}
                        />
                      )}

                      <div className="flex flex-col gap-0.5 pt-2.5">
                        {entries.map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation()
                              onEntryClick(e, slot)
                            }}
                            className={cn(
                              'w-full truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight transition-colors',
                              e.kind === 'block'
                                ? 'border border-dashed border-slate-400 bg-slate-100 text-[color:var(--text-secondary)] dark:bg-slate-800'
                                : 'bg-brand-600 text-white hover:bg-brand-700',
                              e.conflict && 'ring-2 ring-red-500',
                              e.readOnly && 'opacity-70'
                            )}
                          >
                            <span className="block truncate font-medium">{e.title}</span>
                            {e.subtitle && (
                              <span className="block truncate opacity-80">{e.subtitle}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
