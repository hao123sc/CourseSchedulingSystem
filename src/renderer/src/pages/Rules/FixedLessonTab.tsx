import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@renderer/lib/api'
import { useMetaStore } from '@renderer/stores/metaStore'
import { toast } from '@renderer/stores/toastStore'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { Modal } from '@renderer/components/ui/modal'
import { cn } from '@renderer/lib/utils'
import { FixedLessonBoard, type BoardMode } from './FixedLessonBoard'
import { WEEKDAY_NAMES } from '@shared/domain'
import type { FixedLessonConflict } from '@shared/constraints'
import type { FixedLesson, FixedLessonInput, TimeSlot } from '@shared/types/entities'

interface Props {
  semesterId: number
}

type ViewKey = 'list' | BoardMode

/**
 * 四种录入视角。列表适合批量（升旗这种一次铺 60 个班），
 * 三张网格适合「打开这间房 / 这位老师 / 这个班的课表，看哪节空着」。
 */
const VIEWS: { key: ViewKey; label: string; hint: string }[] = [
  { key: 'list', label: '列表', hint: '全部占位一览，支持批量新增' },
  { key: 'classroom', label: '按教室', hint: '打开某间教室的周课表，在格子上点选' },
  { key: 'teacher', label: '按教师', hint: '打开某位教师的周课表，指定他哪一节上哪个班' },
  { key: 'class', label: '按班级', hint: '打开某个班的周课表，钉死某一节' }
]

/** 预排锁定 fixed_lesson：升旗、班会等固定占位（硬约束 H7） */
export function FixedLessonTab({ semesterId }: Props): React.JSX.Element {
  const meta = useMetaStore()
  const [rows, setRows] = useState<FixedLesson[]>([])
  const [conflicts, setConflicts] = useState<FixedLessonConflict[]>([])
  const [adding, setAdding] = useState(false)
  const [view, setView] = useState<ViewKey>('list')

  const load = useCallback(async () => {
    const [list, conf] = await Promise.all([
      api['fixedLesson:list'](semesterId),
      api['fixedLesson:conflicts'](semesterId)
    ])
    setRows(list)
    setConflicts(conf)
  }, [semesterId])

  useEffect(() => {
    void load()
  }, [load])

  const slotById = useMemo(() => {
    const m = new Map<number, TimeSlot>()
    for (const list of Object.values(meta.slotsByStage)) for (const s of list) m.set(s.id, s)
    return m
  }, [meta.slotsByStage])

  const classById = useMemo(() => new Map(meta.classes.map((c) => [c.id, c])), [meta.classes])
  const gradeById = useMemo(() => new Map(meta.grades.map((g) => [g.id, g])), [meta.grades])
  const subjectById = useMemo(() => new Map(meta.subjects.map((s) => [s.id, s])), [meta.subjects])
  const teacherById = useMemo(() => new Map(meta.teachers.map((t) => [t.id, t])), [meta.teachers])
  const roomById = useMemo(() => new Map(meta.classrooms.map((r) => [r.id, r])), [meta.classrooms])

  const conflictRowIds = useMemo(() => {
    const set = new Set<number>()
    for (const c of conflicts) for (const i of c.indexes) if (rows[i]) set.add(rows[i].id)
    return set
  }, [conflicts, rows])

  const remove = async (id: number): Promise<void> => {
    await api['fixedLesson:delete'](id)
    await load()
    toast.success('已删除预排占位')
  }

  /**
   * 冲突转成人话。课时超额是「一个班一门课」整体的问题，跟某一节无关 ——
   * 标时段反而让人以为只有那节要改，所以换成班级 + 学科作主语。
   */
  const describeConflict = (c: FixedLessonConflict): string => {
    if (c.kind !== 'quota') return `${slotLabel(c.slotId)}：${c.message}`
    const r = c.indexes.map((i) => rows[i]).find(Boolean)
    const who =
      r?.classId != null
        ? (meta.classes.find((x) => x.id === r.classId)?.name ?? '某班')
        : r?.gradeId != null
          ? `${meta.grades.find((x) => x.id === r.gradeId)?.name ?? '某年级'} 整年级`
          : '某班'
    const sub =
      r?.subjectId != null ? (meta.subjects.find((x) => x.id === r.subjectId)?.name ?? '') : ''
    return `${who}「${sub}」${c.message}`
  }

  const slotLabel = (slotId: number): string => {
    const s = slotById.get(slotId)
    if (!s) return `时段#${slotId}`
    return `周${WEEKDAY_NAMES[s.dayOfWeek - 1]} ${s.periodName}`
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-btn border border-[color:var(--border-subtle)] p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              title={v.hint}
              onClick={() => setView(v.key)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                view === v.key
                  ? 'bg-brand-600 text-white'
                  : 'text-[color:var(--text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-[color:var(--text-secondary)]">
          {view === 'list'
            ? '预排占位是硬约束 H7，排课时不可被侵占；整年级占位会锁住该年级全部班级'
            : (VIEWS.find((v) => v.key === view)?.hint ?? '')}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone={conflicts.length > 0 ? 'red' : 'green'}>
            {conflicts.length > 0 ? `全学期 ${conflicts.length} 处冲突` : '全学期无冲突'}
          </Badge>
          {view === 'list' && <Button onClick={() => setAdding(true)}>批量新增</Button>}
        </div>
      </div>

      {conflicts.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-card border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {conflicts.slice(0, 8).map((c, i) => (
            <li key={i}>· {describeConflict(c)}</li>
          ))}
          {conflicts.length > 8 && <li>…… 还有 {conflicts.length - 8} 处</li>}
        </ul>
      )}

      {view !== 'list' && (
        <FixedLessonBoard
          semesterId={semesterId}
          mode={view}
          rows={rows}
          conflictIds={conflictRowIds}
          onChanged={() => void load()}
        />
      )}

      {view === 'list' && (
        <div className="overflow-x-auto rounded-card border border-[color:var(--border-subtle)]">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs dark:bg-slate-800/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">时段</th>
                <th className="px-3 py-2 text-left font-semibold">类型</th>
                <th className="px-3 py-2 text-left font-semibold">作用对象</th>
                <th className="px-3 py-2 text-left font-semibold">名称</th>
                <th className="px-3 py-2 text-left font-semibold">学科</th>
                <th className="px-3 py-2 text-left font-semibold">教师</th>
                <th className="px-3 py-2 text-left font-semibold">教室</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-10 text-center text-sm text-[color:var(--text-secondary)]"
                  >
                    还没有预排占位。常见用法：周一第 1 节全校升旗、每周班会、教师例会时段。
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    'border-t border-[color:var(--border-subtle)]',
                    conflictRowIds.has(r.id) && 'bg-red-50/70 dark:bg-red-950/20'
                  )}
                >
                  <td className="px-3 py-1.5 whitespace-nowrap">{slotLabel(r.slotId)}</td>
                  <td className="px-3 py-1.5">
                    {r.kind === 'block' ? (
                      <Badge tone="slate">仅占用</Badge>
                    ) : (
                      <Badge tone="brand">预排课</Badge>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.kind === 'block' ? (
                      <span className="text-[color:var(--text-secondary)]">—</span>
                    ) : r.gradeId != null ? (
                      <Badge tone="brand">{gradeById.get(r.gradeId)?.name ?? '年级'} 整年级</Badge>
                    ) : (
                      <span>{classById.get(r.classId ?? -1)?.name ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">{r.label ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    {r.subjectId != null ? (subjectById.get(r.subjectId)?.name ?? '—') : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.teacherId != null ? (teacherById.get(r.teacherId)?.name ?? '—') : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.classroomId != null ? (roomById.get(r.classroomId)?.name ?? '—') : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => void remove(r.id)}>
                      删除
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <AddFixedLessonModal
          semesterId={semesterId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

function AddFixedLessonModal({
  semesterId,
  onClose,
  onSaved
}: {
  semesterId: number
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const meta = useMetaStore()
  const [target, setTarget] = useState<'grade' | 'class'>('grade')
  const [targetIds, setTargetIds] = useState<number[]>([])
  const [stageId, setStageId] = useState<number | null>(
    (meta.stages.find((s) => s.enabled) ?? meta.stages[0])?.id ?? null
  )
  const [slotIds, setSlotIds] = useState<number[]>([])
  const [label, setLabel] = useState('升旗仪式')
  const [subjectId, setSubjectId] = useState<number | ''>('')
  const [teacherId, setTeacherId] = useState<number | ''>('')
  const [classroomId, setClassroomId] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)

  const stage = meta.stages.find((s) => s.id === stageId)
  const days = Array.from({ length: stage?.daysPerWeek ?? 5 }, (_, i) => i + 1)
  const slotsByStage = meta.slotsByStage
  const periods = useMemo(() => {
    const slots = stageId != null ? (slotsByStage[stageId] ?? []) : []
    const m = new Map<number, { name: string; byDay: Map<number, TimeSlot> }>()
    for (const s of slots) {
      if (s.dayOfWeek > (stage?.daysPerWeek ?? 5)) continue
      let row = m.get(s.periodIndex)
      if (!row) {
        row = { name: s.periodName, byDay: new Map() }
        m.set(s.periodIndex, row)
      }
      row.byDay.set(s.dayOfWeek, s)
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [stageId, slotsByStage, stage])

  const options = target === 'grade' ? meta.grades : meta.classes

  const submit = async (): Promise<void> => {
    if (targetIds.length === 0 || slotIds.length === 0) {
      toast.error('请至少选择一个对象和一个时段')
      return
    }
    setBusy(true)
    try {
      const payloads: FixedLessonInput[] = []
      for (const t of targetIds) {
        for (const slotId of slotIds) {
          payloads.push({
            semesterId,
            gradeId: target === 'grade' ? t : null,
            classId: target === 'class' ? t : null,
            subjectId: subjectId === '' ? null : Number(subjectId),
            teacherId: teacherId === '' ? null : Number(teacherId),
            classroomId: classroomId === '' ? null : Number(classroomId),
            slotId,
            label: label.trim() || null
          })
        }
      }
      await api['fixedLesson:bulkCreate'](payloads)
      toast.success(`已创建 ${payloads.length} 条预排占位`)
      onSaved()
    } catch (err) {
      toast.error(`创建失败：${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="新增预排占位"
      description="选中的「对象 × 时段」会两两组合批量创建"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? '创建中…' : `创建 ${targetIds.length * slotIds.length} 条`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0">名称</span>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="如：升旗仪式 / 班会"
          />
        </div>

        <div className="flex items-start gap-2">
          <span className="mt-1.5 w-16 shrink-0">作用对象</span>
          <div className="flex-1">
            <div className="mb-1.5 flex gap-1">
              {(['grade', 'class'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTarget(t)
                    setTargetIds([])
                  }}
                  className={cn(
                    'rounded-btn border px-2.5 py-1 text-xs',
                    target === t
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                      : 'border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]'
                  )}
                >
                  {t === 'grade' ? '整年级' : '指定班级'}
                </button>
              ))}
              <button
                type="button"
                className="ml-auto text-xs text-brand-700 underline-offset-2 hover:underline dark:text-brand-100"
                onClick={() => setTargetIds(options.map((o) => o.id))}
              >
                全选
              </button>
            </div>
            <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto rounded-card border border-[color:var(--border-subtle)] p-1.5">
              {options.map((o) => {
                const on = targetIds.includes(o.id)
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() =>
                      setTargetIds((prev) =>
                        prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id]
                      )
                    }
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs',
                      on
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-[color:var(--text-secondary)] dark:bg-slate-800'
                    )}
                  >
                    {o.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="mt-1.5 w-16 shrink-0">时段</span>
          <div className="flex-1">
            <Select
              value={stageId ?? ''}
              onChange={(e) => {
                setStageId(Number(e.target.value))
                setSlotIds([])
              }}
              className="mb-1.5 h-8 w-32 text-xs"
            >
              {meta.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <table className="border-separate border-spacing-0.5 text-[11px]">
              <thead>
                <tr>
                  <th />
                  {days.map((d) => (
                    <th key={d} className="px-1 font-medium">
                      周{WEEKDAY_NAMES[d - 1]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map(([pi, row]) => (
                  <tr key={pi}>
                    <th className="pr-1 text-right font-normal text-[color:var(--text-secondary)]">
                      {row.name}
                    </th>
                    {days.map((d) => {
                      const s = row.byDay.get(d)
                      if (!s) return <td key={d} />
                      const on = slotIds.includes(s.id)
                      return (
                        <td key={d}>
                          <button
                            type="button"
                            onClick={() =>
                              setSlotIds((prev) =>
                                prev.includes(s.id)
                                  ? prev.filter((x) => x !== s.id)
                                  : [...prev, s.id]
                              )
                            }
                            className={cn(
                              'h-6 w-12 rounded border text-[10px] transition-colors',
                              on
                                ? 'border-brand-600 bg-brand-600 text-white'
                                : 'border-[color:var(--border-subtle)] hover:bg-slate-100 dark:hover:bg-slate-800'
                            )}
                          >
                            {on ? '✓' : ''}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0">可选</span>
          <Select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value === '' ? '' : Number(e.target.value))}
            className="h-8 w-28 text-xs"
          >
            <option value="">不指定学科</option>
            {meta.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value === '' ? '' : Number(e.target.value))}
            className="h-8 w-28 text-xs"
          >
            <option value="">不指定教师</option>
            {meta.teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value === '' ? '' : Number(e.target.value))}
            className="h-8 w-32 text-xs"
          >
            <option value="">不指定教室</option>
            {meta.classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Modal>
  )
}
