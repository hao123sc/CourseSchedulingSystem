import { Fragment } from 'react'
import { cn } from '@renderer/lib/utils'
import { LessonCard } from '@renderer/components/timetable/LessonCard'
import type { ClassGrid, GridLesson, SlotAxis } from '@renderer/pages/Timetable/timetableModel'

/**
 * 周课表网格（docs/mockups/timetable.html · 课表区定稿）：
 * table border-spacing 5px，节次列 58px（第 N 节 + 起止时间两行小字）；
 * 顶部星期行「今天」高亮；午休 / 晚间段之间插分隔条；
 * 班级 / 教室视图空槽画虚线空格；教师视图空隙画斜纹（gap）。
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
  const rowsByDay = new Map<number, typeof axis.rows>()
  for (const r of axis.rows) {
    const arr = rowsByDay.get(r.day)
    if (arr) arr.push(r)
    else rowsByDay.set(r.day, [r])
  }
  let seq = 0

  return (
    <div className="overflow-x-auto pb-1">
      {/* table-fixed：课程块是绝对定位（连堂跨行需要），不参与 auto 列宽计算，
          auto 布局会把宽度全分给时间列、星期列压成细条——列宽必须由表头定死 */}
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
                  'text-[13px] font-semibold py-2 rounded-btn',
                  d === today
                    ? 'text-brand-700 bg-brand-50 dark:bg-brand-600/15 dark:text-brand-50'
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
          {axis.days.map((d) =>
            (rowsByDay.get(d) ?? []).map((r) => {
              const divider = axis.dividerBefore.get(r.slotId)
              const cell = grid.lessonsBySlot.get(r.slotId)
              const isCovered = grid.covered.has(r.slotId)
              const isGap = view === 'teacher' && gapSlots.has(r.slotId)
              const wf = waterfall && cell && cell.length > 0 ? seq++ : -1
              return (
                <Fragment key={r.slotId}>
                  {divider != null && <DividerRow label={divider} days={axis.days.length} />}
                  <tr>
                    <td className="align-middle text-center pr-1">
                      <div className="text-[12px] font-medium text-text-2 leading-4">
                        {r.periodName}
                      </div>
                      {r.times && (
                        <div className="text-[9.5px] text-text-3 whitespace-pre leading-3 pt-0.5">
                          {r.times}
                        </div>
                      )}
                    </td>
                    {axis.days.map((dd) => {
                      if (dd !== d) return <td key={dd} />
                      const items = cell ?? []
                      return (
                        <td key={dd} className="tt-cell">
                          {isCovered ? null : items.length > 0 ? (
                            items.map((l, i) => (
                              <LessonCard
                                key={l.key}
                                lesson={l}
                                selected={selected?.key === l.key}
                                waterfallIndex={wf}
                                stack={
                                  items.length > 1 ? { index: i, count: items.length } : undefined
                                }
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
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function DividerRow({ label, days }: { label: string; days: number }): React.JSX.Element {
  return (
    <tr>
      <td />
      <td colSpan={days} className="pt-1 pb-1">
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
