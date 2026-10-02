import { useMemo, useState } from 'react'
import { Modal } from '@renderer/components/ui/modal'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import type { Subject, Teacher, TeacherWorkload } from '@shared/types/entities'

interface TeacherPickerProps {
  open: boolean
  onClose: () => void
  /** 待指派的单元格（可能跨多个学科，标题据此提示） */
  cells: { classId: number; subjectId: number }[]
  subjects: Subject[]
  teachers: Teacher[]
  workloads: TeacherWorkload[]
  /** 本次指派将新增的周课时（用于预测是否会超限） */
  addedPeriods: number
  onPick: (teacherId: number | null) => void
}

/**
 * 教师指派器（docs/05 §4.2）。
 * 只列任教该科的教师；**超工作量者标红并置底**，并按「剩余可带课时」从多到少排序，
 * 让教务一眼看到该派谁。选区跨多个学科时列出全部教师并给出提示。
 */
export function TeacherPicker({
  open,
  onClose,
  cells,
  subjects,
  teachers,
  workloads,
  addedPeriods,
  onPick
}: TeacherPickerProps): React.JSX.Element {
  const [query, setQuery] = useState('')

  const subjectIds = useMemo(() => Array.from(new Set(cells.map((c) => c.subjectId))), [cells])
  const singleSubject = subjectIds.length === 1 ? subjectIds[0] : null
  const subjectName =
    singleSubject != null ? (subjects.find((s) => s.id === singleSubject)?.name ?? '') : ''

  const loadMap = useMemo(() => new Map(workloads.map((w) => [w.teacherId, w])), [workloads])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = teachers
      .filter((t) => t.enabled)
      .filter((t) => (singleSubject == null ? true : t.subjectIds.includes(singleSubject)))
      .filter((t) => (q === '' ? true : t.name.toLowerCase().includes(q)))
      .map((t) => {
        const w = loadMap.get(t.id)
        const assigned = w?.assignedPeriods ?? 0
        const max = t.maxWeeklyPeriods
        const after = assigned + addedPeriods
        return { teacher: t, assigned, max, after, over: after > max, remaining: max - assigned }
      })
    // 未超限在前（剩余多的优先），超限的沉底
    return list.sort((a, b) => {
      if (a.over !== b.over) return a.over ? 1 : -1
      return b.remaining - a.remaining
    })
  }, [teachers, singleSubject, query, loadMap, addedPeriods])

  const fallbackCount = useMemo(
    () =>
      singleSubject == null
        ? 0
        : teachers.filter((t) => t.enabled && !t.subjectIds.includes(singleSubject)).length,
    [teachers, singleSubject]
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="指派任课教师"
      description={
        singleSubject != null
          ? `${subjectName} · 共 ${cells.length} 个班，本次将为每位教师新增 ${addedPeriods} 节/周`
          : `选区跨 ${subjectIds.length} 个学科 · 共 ${cells.length} 格`
      }
      className="max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onPick(null)}>
            清除指派
          </Button>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        placeholder="搜索教师姓名…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3"
      />

      {candidates.length === 0 ? (
        <p className="py-8 text-center text-sm text-[color:var(--text-secondary)]">
          没有登记任教「{subjectName}」的教师
          {fallbackCount > 0 && <> —— 请先到「基础数据 → 教师」为教师勾选该学科</>}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {candidates.map((c) => {
            const pct = c.max > 0 ? Math.min(100, (c.after / c.max) * 100) : 0
            return (
              <li key={c.teacher.id}>
                <button
                  type="button"
                  onClick={() => onPick(c.teacher.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-btn border px-3 py-2 text-left transition-colors',
                    c.over
                      ? 'border-red-200 bg-red-50/60 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30'
                      : 'border-[color:var(--border-subtle)] hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  <span
                    className={cn(
                      'w-16 shrink-0 truncate text-sm font-medium',
                      c.over && 'text-red-700 dark:text-red-300'
                    )}
                  >
                    {c.teacher.name}
                  </span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <span
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full transition-all',
                        c.over ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-brand-600'
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-[color:var(--text-secondary)]">
                    {c.assigned}
                    {addedPeriods > 0 && <span className="text-brand-600">+{addedPeriods}</span>}
                    {' / '}
                    {c.max}
                  </span>
                  {c.over ? (
                    <Badge tone="red">超限</Badge>
                  ) : (
                    <Badge tone="green">余 {c.remaining}</Badge>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
