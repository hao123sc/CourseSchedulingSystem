import { useMemo } from 'react'
import { findTopSwapSuggestions } from '@shared/swapSuggest'
import type { TimeSlot, Subject, Teacher, Lesson } from '@shared/types/entities'
import type { GridLesson } from '@renderer/pages/Timetable/timetableModel'
import { Button } from '@renderer/components/ui/button'

const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

interface SwapSuggestPanelProps {
  selectedLesson: GridLesson | null
  lessons: Lesson[]
  slots: TimeSlot[]
  subjects: Subject[]
  teachers: Teacher[]
  onApplySuggestion: (targetSlotId: number, swapWithLessonId?: number) => void
}

export function SwapSuggestPanel({
  selectedLesson,
  lessons,
  slots,
  subjects,
  teachers,
  onApplySuggestion
}: SwapSuggestPanelProps): React.JSX.Element {
  const suggestions = useMemo(() => {
    if (!selectedLesson || selectedLesson.lessonId == null || selectedLesson.locked) return []

    const context = {
      lessons: lessons.map((l) => ({
        id: l.id,
        classId: l.classId,
        subjectId: l.subjectId,
        teacherId: l.teacherId,
        classroomId: l.classroomId,
        slotId: l.slotId,
        isLocked: l.isLocked,
        weekMode: l.weekMode,
        consecutiveGroup: l.consecutiveGroup
      })),
      slots,
      subjects,
      teachers
    }

    return findTopSwapSuggestions(selectedLesson.lessonId, context, 5)
  }, [selectedLesson, lessons, slots, subjects, teachers])

  if (!selectedLesson || selectedLesson.lessonId == null) {
    return (
      <div className="rounded-card border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--panel)] p-4">
        <div className="flex items-center gap-2">
          <span className="text-base">💡</span>
          <h3 className="text-[13px] font-semibold text-[color:var(--text-1)]">智能换课建议</h3>
        </div>
        <p className="mt-2 text-xs leading-5 text-[color:var(--text-3)]">
          在课表中点击任意非锁定课程块，系统将基于全校硬冲突检测与多维度质量模型，为您自动分析并推荐 Top 5 最优调课与对调方案。
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-card border border-brand-200 bg-[color:var(--panel)] p-4 shadow-sm dark:border-brand-900/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <h3 className="text-[13px] font-semibold text-brand-700 dark:text-brand-300">
            换课建议 · Top {suggestions.length}
          </h3>
        </div>
        <span className="text-[11px] font-medium text-[color:var(--text-3)]">
          当前：{selectedLesson.subjectName} {selectedLesson.meta ? `(${selectedLesson.meta})` : ''}
        </span>
      </div>

      {suggestions.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-[color:var(--text-3)]">
          当前课程受教师/班级约束较为紧密，未检测到零冲突的明显改善槽位。您可以尝试拖拽换课。
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {suggestions.map((s, idx) => {
            const dayName = DAY_NAMES[s.targetDay] ?? `周${s.targetDay}`
            const isMove = s.actionType === 'move'
            return (
              <div
                key={`${s.targetSlotId}_${idx}`}
                className="group relative flex flex-col gap-1.5 rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--bg)] p-2.5 transition-all hover:border-brand-400 hover:shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-[color:var(--text-1)]">
                      {dayName} {s.targetPeriodName}
                    </span>
                    <span className="text-[10px] text-[color:var(--text-3)]">
                      {s.targetSegment === 'morning' ? '上午' : s.targetSegment === 'afternoon' ? '下午' : '晚间'}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px] font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950"
                    onClick={() => onApplySuggestion(s.targetSlotId, s.swappedLesson?.id)}
                  >
                    一键{isMove ? '移入' : '对调'}
                  </Button>
                </div>

                <div className="text-[11px] text-[color:var(--text-2)]">
                  {isMove ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ➜ 移至空闲槽位
                    </span>
                  ) : (
                    <span className="text-blue-600 dark:text-blue-400">
                      ⇄ 与「{s.swappedLesson?.subjectName}
                      {s.swappedLesson?.teacherName ? ` (${s.swappedLesson.teacherName})` : ''}」互换
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {s.reasons.map((r, rIdx) => (
                    <span
                      key={rIdx}
                      className="rounded bg-[color:var(--surface)] px-1.5 py-0.5 text-[10px] text-[color:var(--text-3)]"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
