import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@renderer/components/ui/modal'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import { CURRICULUM_PRESETS, planTotal, suggestPlanForGrade } from '@shared/curriculumPresets'
import type { Grade, Stage, Subject } from '@shared/types/entities'

interface CurriculumDialogProps {
  open: boolean
  onClose: () => void
  grades: Grade[]
  stages: Stage[]
  subjects: Subject[]
  /** 默认勾选的年级 */
  defaultGradeIds: number[]
  onApply: (payload: {
    planCode: string
    gradeIds: number[]
    overwrite: boolean
    entries: { subject: string; periods: number }[]
  }) => Promise<void> | void
}

/**
 * 国家课程标准课时方案一键套用（docs/05 §4.2 顶部快捷条）。
 * 预设值来自 `@shared/curriculumPresets`，**套用前可逐格改数字**，
 * 学科按名称匹配，匹配不上的会提前标红提示，不会静默丢弃。
 */
export function CurriculumDialog({
  open,
  onClose,
  grades,
  stages,
  subjects,
  defaultGradeIds,
  onApply
}: CurriculumDialogProps): React.JSX.Element {
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages])
  const [planCode, setPlanCode] = useState(CURRICULUM_PRESETS[0].code)
  const [gradeIds, setGradeIds] = useState<number[]>(defaultGradeIds)
  const [overwrite, setOverwrite] = useState(true)
  const [edited, setEdited] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)

  const plan = useMemo(
    () => CURRICULUM_PRESETS.find((p) => p.code === planCode) ?? CURRICULUM_PRESETS[0],
    [planCode]
  )
  const subjectNames = useMemo(() => new Set(subjects.map((s) => s.name)), [subjects])

  // 打开时按默认年级自动挑方案
  useEffect(() => {
    if (!open) return
    setGradeIds(defaultGradeIds)
    setEdited({})
    const first = grades.find((g) => defaultGradeIds.includes(g.id)) ?? grades[0]
    if (first) {
      const suggested = suggestPlanForGrade(first.name, stageById.get(first.stageId)?.code)
      if (suggested) setPlanCode(suggested.code)
    }
  }, [open, defaultGradeIds, grades, stageById])

  const entries = useMemo(
    () =>
      plan.entries.map((e) => ({ subject: e.subject, periods: edited[e.subject] ?? e.periods })),
    [plan, edited]
  )
  const total = entries.reduce((s, e) => s + e.periods, 0)
  const missing = entries.filter((e) => !subjectNames.has(e.subject))

  const toggleGrade = (id: number): void =>
    setGradeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const apply = async (): Promise<void> => {
    setBusy(true)
    try {
      await onApply({ planCode: plan.code, gradeIds, overwrite, entries })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="按国家课程标准一键套用课时"
      description={plan.source}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={apply} disabled={busy || gradeIds.length === 0}>
            {busy ? '套用中…' : `套用到 ${gradeIds.length} 个年级`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-sm">课时方案</span>
          <Select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
            {CURRICULUM_PRESETS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}（周 {planTotal(p)} 节）
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-start gap-2">
          <span className="mt-1.5 w-16 shrink-0 text-sm">应用年级</span>
          <div className="flex flex-wrap gap-1.5">
            {grades.length === 0 && (
              <span className="text-sm text-[color:var(--text-secondary)]">当前学期没有年级</span>
            )}
            {grades.map((g) => {
              const on = gradeIds.includes(g.id)
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGrade(g.id)}
                  className={cn(
                    'rounded-btn border px-2.5 py-1 text-xs transition-colors',
                    on
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                      : 'border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-800'
                  )}
                >
                  {g.name}
                  <span className="ml-1 opacity-60">{stageById.get(g.stageId)?.name ?? ''}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm">
              课时明细
              <span className="ml-2 text-xs text-[color:var(--text-secondary)]">
                可直接改数字，改完再套用
              </span>
            </span>
            <Badge tone={total > 45 ? 'amber' : 'brand'}>周合计 {total} 节</Badge>
          </div>
          <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto rounded-card border border-[color:var(--border-subtle)] p-2 sm:grid-cols-3">
            {entries.map((e) => {
              const unknown = !subjectNames.has(e.subject)
              return (
                <label
                  key={e.subject}
                  className={cn(
                    'flex items-center justify-between gap-1 rounded-btn px-2 py-1 text-xs',
                    unknown ? 'bg-red-50 dark:bg-red-950/30' : 'bg-slate-50 dark:bg-slate-800/60'
                  )}
                  title={unknown ? '学科表里没有这个名称，套用时会跳过' : undefined}
                >
                  <span className={cn('truncate', unknown && 'text-red-600 dark:text-red-300')}>
                    {e.subject}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={e.periods}
                    onChange={(ev) =>
                      setEdited((prev) => ({
                        ...prev,
                        [e.subject]: Math.max(0, Math.floor(Number(ev.target.value) || 0))
                      }))
                    }
                    className="h-6 w-12 rounded border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-1 text-center tabular-nums outline-none focus:ring-1 focus:ring-brand-600"
                  />
                </label>
              )
            })}
          </div>
          {missing.length > 0 && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-300">
              学科表中缺少：{missing.map((m) => m.subject).join('、')} —— 这些行会被跳过，
              如需排课请先到「基础数据 → 学科」新增同名学科
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          覆盖已有课时
          <span className="text-xs text-[color:var(--text-secondary)]">
            （不勾选则只补空缺，保留教务手工调过的数字）
          </span>
        </label>
      </div>
    </Modal>
  )
}
