import { Fragment } from 'react'
import { cn } from '@renderer/lib/utils'
import { LessonCard } from '@renderer/components/timetable/LessonCard'
import type { ClassGrid, GridLesson, SlotAxis } from '@renderer/pages/Timetable/timetableModel'

/**
 * 周课表网格（docs/mockups/timetable.html · 课表区定稿）：
 * 列 = 周一~周五，行 = 节次（同学段内每天作息模板一致，按 periodIndex 对齐各天）；
 * table border-spacing 5px，节次列 58px（第 N 节 + 起止时间两行小字）；
 * 顶部星期行「今天」高亮；午休 / 晚间段之间插整行分隔条；
 * 班级 / 教室视图空槽画虚线空格；教师视图空隙画斜纹（gap）。
 *
 * 注意 table-fixed：课程块是绝对定位（连堂跨行需要），不参与 auto 列宽计算，
 * 列宽必须由表头定死（时间列 58px，星期列均分剩余宽度）。
 */
export function TimetableGrid({
  axis,
  grid,
  view,
  gapSlots,
  selected,
  onSelect,
  waterfall
}: {
  axis: SlotAxis
  grid: ClassGrid
  view: 'class' | 'teacher' | 'room'
  gapSlots: Set<number>
  selected: GridLesson | null
  onSelect: (l: GridLesson) => void
  waterfall: boolean
}): React.JSX.Element {
  const today = todayHighlight(axis.days)
  const periodRows = buildPeriodRows(axis)
  let seq = 0

  return (
    <div className="overflow-x-auto pb-1">
      <table
        className="w-full table-fixed border-separate min-w-[760px]"
        style={{ borderSpacing: '5px' }}
      >
        <thead>
          <tr>
            <th className="w-[58px] min-w-[58px]" />
            {axis.days.map((d) => (
              <th
                key={d}
                className={cn(
                  'rounded-btn py-2 text-[13px] font-semibold',
                  d === today
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/15 dark:text-brand-50'
                    : 'text-text-2'
                )}
              >
                {DAY_NAMES[d]}
                {d === today ? ' · 今天' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periodRows.map((pr) => (
            <Fragment key={pr.periodIndex}>
              {pr.divider != null && <DividerRow label={pr.divider} days={axis.days.length} />}
              <tr>
                <td className="pr-1 text-center align-middle">
                  <div className="text-[12px] font-medium leading-4 text-text-2">
                    {pr.periodName}
                  </div>
                  {pr.times && (
                    <div className="whitespace-pre pt-0.5 text-[9.5px] leading-3 text-text-3">
                      {pr.times}
                    </div>
                  )}
                </td>
                {axis.days.map((d) => {
                  const sid = pr.slotByDay.get(d)
                  if (sid == null) return <td key={d} />
                  const items = grid.lessonsBySlot.get(sid) ?? []
                  const isCovered = grid.covered.has(sid)
                  const isGap = view === 'teacher' && gapSlots.has(sid)
                  const wf = waterfall && items.length > 0 ? seq++ : -1
                  return (
                    <td key={d} className="tt-cell">
                      {isCovered ? null : items.length > 0 ? (
                        items.map((l, i) => (
                          <LessonCard
                            key={l.key}
                            lesson={l}
                            selected={selected?.key === l.key}
                            waterfallIndex={wf}
                            stack={items.length > 1 ? { index: i, count: items.length } : undefined}
                            onSelect={onSelect}
                          />
                        ))
                      ) : isGap ? (
                        <div className="tt-gap" title="空隙课" />
                      ) : view === 'teacher' ? (
                        <div />
                      ) : (
                        <div className="tt-empty" />
                      )}
                    </td>
                  )
                })}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 行 = 节次：按 periodIndex 把各天同学节次的 slot 对齐到同一行（同学段作息模板一致） */
interface PeriodRow {
  periodIndex: number
  periodName: string
  times: string
  /** day → slotId */
  slotByDay: Map<number, number>
  /** 该行前要插的分隔条文案（午休 / 晚间，任一天标记即出） */
  divider: string | null
}

function buildPeriodRows(axis: SlotAxis): PeriodRow[] {
  const byIndex = new Map<number, PeriodRow>()
  for (const r of axis.rows) {
    let row = byIndex.get(r.periodIndex)
    if (row == null) {
      row = {
        periodIndex: r.periodIndex,
        periodName: r.periodName,
        times: r.times,
        slotByDay: new Map(),
        divider: null
      }
      byIndex.set(r.periodIndex, row)
    }
    row.slotByDay.set(r.day, r.slotId)
    const dv = axis.dividerBefore.get(r.slotId)
    if (dv != null && row.divider == null) row.divider = dv
  }
  return [...byIndex.values()].sort((a, b) => a.periodIndex - b.periodIndex)
}

function DividerRow({ label, days }: { label: string; days: number }): React.JSX.Element {
  return (
    <tr>
      <td />
      <td colSpan={days} className="pb-1 pt-1">
        <div className="tt-divider-bar">{label}</div>
      </td>
    </tr>
  )
}

const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

function todayHighlight(days: number[]): number | null {
  const d = new Date().getDay()
  return d >= 1 && d <= 7 && days.includes(d) ? d : null
}
