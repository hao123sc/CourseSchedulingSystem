import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@renderer/lib/api'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { useMetaStore } from '@renderer/stores/metaStore'
import { toast } from '@renderer/stores/toastStore'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import {
  MatrixEditor,
  cellKey,
  type MatrixCol,
  type MatrixPatch,
  type MatrixRow
} from '@renderer/components/matrix/MatrixEditor'
import { WorkloadPanel } from '@renderer/components/matrix/WorkloadPanel'
import { TeacherPicker } from '@renderer/components/matrix/TeacherPicker'
import { CurriculumDialog } from '@renderer/components/matrix/CurriculumDialog'
import type { TeachingTask, TeacherWorkload } from '@shared/types/entities'

const SHORTCUTS = [
  ['方向键', '移动'],
  ['Shift+方向键 / 拖选', '框选'],
  ['直接输入数字', '填入（选区则整片填入）'],
  ['Ctrl+D / Ctrl+R', '向下 / 向右填充'],
  ['Ctrl+C / Ctrl+V', '复制 / 粘贴区块'],
  ['Tab / Enter', '跳下一格'],
  ['Delete', '清零'],
  ['点单元格下半区', '指派教师']
]

export function TeachingMatrixPage(): React.JSX.Element {
  const { currentSemester, loaded, load: loadSchool } = useSchoolStore()
  const meta = useMetaStore()
  const semesterId = currentSemester?.id ?? null

  const [tasks, setTasks] = useState<TeachingTask[]>([])
  const [workloads, setWorkloads] = useState<TeacherWorkload[]>([])
  const [gradeFilter, setGradeFilter] = useState<number | 'all'>('all')
  const [hideEmptyCols, setHideEmptyCols] = useState(false)
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState<{ cells: { classId: number; subjectId: number }[] } | null>(
    null
  )
  const [curriculumOpen, setCurriculumOpen] = useState(false)
  const [selection, setSelection] = useState<{ classId: number; subjectId: number }[]>([])

  useEffect(() => {
    if (!loaded) void loadSchool()
  }, [loaded, loadSchool])

  const refresh = useCallback(async (sid: number) => {
    const [t, w] = await Promise.all([api['task:list'](sid), api['task:workloads'](sid)])
    setTasks(t)
    setWorkloads(w)
  }, [])

  useEffect(() => {
    if (semesterId == null) return
    void meta.load(semesterId)
    void refresh(semesterId)
  }, [semesterId, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 派生数据 ─────────────────────────────────────────────────────────
  const gradeById = useMemo(() => new Map(meta.grades.map((g) => [g.id, g])), [meta.grades])
  const teacherById = useMemo(() => new Map(meta.teachers.map((t) => [t.id, t])), [meta.teachers])

  /** 每个学段一周可排的教学时段数 */
  const stageCapacity = useMemo(() => {
    const map = new Map<number, number>()
    for (const s of meta.stages) {
      const slots = meta.slotsByStage[s.id] ?? []
      map.set(s.id, slots.filter((sl) => sl.isTeaching && sl.dayOfWeek <= s.daysPerWeek).length)
    }
    return map
  }, [meta.stages, meta.slotsByStage])

  const rows: MatrixRow[] = useMemo(() => {
    return meta.classes
      .filter((c) => (gradeFilter === 'all' ? true : c.gradeId === gradeFilter))
      .map((c) => {
        const g = gradeById.get(c.gradeId)
        const stageId = g?.stageId
        return {
          classId: c.id,
          label: c.name,
          groupLabel: g?.name ?? '',
          capacity: stageId != null ? (stageCapacity.get(stageId) ?? 0) : 0
        }
      })
  }, [meta.classes, gradeFilter, gradeById, stageCapacity])

  const values = useMemo(() => {
    const map = new Map<string, { periods: number; teacherId: number | null }>()
    for (const t of tasks) {
      if (t.weekMode !== 'all') continue
      map.set(cellKey(t.classId, t.subjectId), {
        periods: t.weeklyPeriods,
        teacherId: t.teacherId
      })
    }
    return map
  }, [tasks])

  const cols: MatrixCol[] = useMemo(() => {
    const visibleClassIds = new Set(rows.map((r) => r.classId))
    return meta.subjects
      .filter((s) => {
        if (!hideEmptyCols) return true
        return tasks.some(
          (t) => t.subjectId === s.id && visibleClassIds.has(t.classId) && t.weeklyPeriods > 0
        )
      })
      .map((s) => ({
        subjectId: s.id,
        label: s.name,
        shortLabel: s.shortName,
        color: s.color
      }))
  }, [meta.subjects, hideEmptyCols, tasks, rows])

  // ── 写入 ─────────────────────────────────────────────────────────────
  const applyPatches = useCallback(
    async (patches: MatrixPatch[]) => {
      if (semesterId == null || patches.length === 0) return
      // 乐观更新：先改本地，再落库，保证大面积填充手感不卡
      setTasks((prev) => {
        const map = new Map(prev.map((t) => [cellKey(t.classId, t.subjectId), t]))
        for (const p of patches) {
          const key = cellKey(p.classId, p.subjectId)
          const cur = map.get(key)
          if (p.weeklyPeriods != null && p.weeklyPeriods <= 0) {
            map.delete(key)
            continue
          }
          if (cur) {
            map.set(key, {
              ...cur,
              weeklyPeriods: p.weeklyPeriods ?? cur.weeklyPeriods,
              teacherId: p.teacherId !== undefined ? p.teacherId : cur.teacherId
            })
          } else if (p.weeklyPeriods != null && p.weeklyPeriods > 0) {
            map.set(key, {
              id: -Math.floor(Math.random() * 1e9),
              semesterId,
              classId: p.classId,
              subjectId: p.subjectId,
              teacherId: p.teacherId ?? null,
              weeklyPeriods: p.weeklyPeriods,
              consecutiveCount: 0,
              consecutiveSize: 2,
              weekMode: 'all',
              mergeGroupId: null,
              fixedRoomId: null
            })
          }
        }
        return [...map.values()]
      })
      try {
        const saved = await api['task:applyMatrix'](semesterId, patches)
        setTasks(saved)
        setWorkloads(await api['task:workloads'](semesterId))
      } catch (err) {
        toast.error(`保存失败：${String(err)}`)
        void refresh(semesterId)
      }
    },
    [semesterId, refresh]
  )

  const assignTeacher = async (teacherId: number | null): Promise<void> => {
    if (semesterId == null || !picker) return
    setBusy(true)
    try {
      const saved = await api['task:assignTeacher'](semesterId, picker.cells, teacherId)
      setTasks(saved)
      setWorkloads(await api['task:workloads'](semesterId))
      toast.success(
        teacherId == null
          ? `已清除 ${picker.cells.length} 个任务的教师`
          : `已指派 ${teacherById.get(teacherId)?.name ?? ''} 到 ${picker.cells.length} 个任务`
      )
      setPicker(null)
    } catch (err) {
      toast.error(`指派失败：${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const applyCurriculum = async (payload: {
    planCode: string
    gradeIds: number[]
    overwrite: boolean
    entries: { subject: string; periods: number }[]
  }): Promise<void> => {
    if (semesterId == null) return
    const res = await api['task:applyCurriculum']({ semesterId, ...payload })
    await refresh(semesterId)
    setCurriculumOpen(false)
    const skipped =
      res.skippedSubjects.length > 0 ? `，跳过未匹配学科：${res.skippedSubjects.join('、')}` : ''
    toast.success(
      `已套用到 ${res.affectedClasses} 个班：新增 ${res.created} 条、更新 ${res.updated} 条${skipped}`
    )
  }

  const clearAll = async (): Promise<void> => {
    if (semesterId == null) return
    const scope = gradeFilter === 'all' ? undefined : [gradeFilter]
    const label = gradeFilter === 'all' ? '全部年级' : (gradeById.get(gradeFilter)?.name ?? '')
    if (!window.confirm(`确定清空「${label}」的全部教学任务？此操作不可撤销。`)) return
    const n = await api['task:clear'](semesterId, scope)
    await refresh(semesterId)
    toast.success(`已清空 ${n} 条教学任务`)
  }

  // ── 概览统计 ─────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const visible = new Set(rows.map((r) => r.classId))
    const scoped = tasks.filter((t) => visible.has(t.classId))
    return {
      taskCount: scoped.length,
      periodCount: scoped.reduce((s, t) => s + t.weeklyPeriods, 0),
      unassigned: scoped.filter((t) => t.teacherId == null).length,
      overloadRows: rows.filter((r) => {
        const total = cols.reduce(
          (s, col) => s + (values.get(cellKey(r.classId, col.subjectId))?.periods ?? 0),
          0
        )
        return total > r.capacity
      }).length
    }
  }, [tasks, rows, cols, values])

  const selectionTeacherIds = useMemo(() => {
    const ids = new Set<number>()
    for (const c of selection) {
      const v = values.get(cellKey(c.classId, c.subjectId))
      if (v?.teacherId != null) ids.add(v.teacherId)
    }
    return [...ids]
  }, [selection, values])

  const pickerAddedPeriods = useMemo(() => {
    if (!picker) return 0
    return picker.cells.reduce(
      (s, c) => s + (values.get(cellKey(c.classId, c.subjectId))?.periods ?? 0),
      0
    )
  }, [picker, values])

  if (semesterId == null) {
    return <EmptyHint text="请先到「学校设置」创建并选择当前学期，再来配置教学任务。" />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">教学任务</h1>
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
            行=班级、列=学科，上半格填周课时、下半格指派教师 · {currentSemester?.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(gradeFilter)}
            onChange={(e) =>
              setGradeFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
            }
            className="w-36"
          >
            <option value="all">全部年级（{meta.classes.length} 班）</option>
            {meta.grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}（{meta.classes.filter((c) => c.gradeId === g.id).length} 班）
              </option>
            ))}
          </Select>
          <Button onClick={() => setCurriculumOpen(true)}>按国家课程标准套用</Button>
          <Button variant="outline" onClick={clearAll}>
            清空
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="brand">{summary.taskCount} 条任务</Badge>
        <Badge tone="slate">{summary.periodCount} 节/周</Badge>
        {summary.unassigned > 0 ? (
          <Badge tone="amber">{summary.unassigned} 条未指派教师</Badge>
        ) : (
          <Badge tone="green">教师已配齐</Badge>
        )}
        {summary.overloadRows > 0 && (
          <Badge tone="red">{summary.overloadRows} 个班课时超容量</Badge>
        )}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[color:var(--text-secondary)]">
          <input
            type="checkbox"
            checked={hideEmptyCols}
            onChange={(e) => setHideEmptyCols(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-600"
          />
          隐藏未使用的学科列
        </label>
      </div>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <MatrixEditor
            rows={rows}
            cols={cols}
            values={values}
            teacherName={(id) => teacherById.get(id)?.name ?? `#${id}`}
            onChange={(p) => void applyPatches(p)}
            onAssignTeacher={(cells) => setPicker({ cells })}
            onSelectionChange={setSelection}
          />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[color:var(--text-secondary)]">
            {SHORTCUTS.map(([k, v]) => (
              <span key={k}>
                <kbd className="rounded border border-[color:var(--border-subtle)] bg-slate-100 px-1 py-px font-mono text-[10px] dark:bg-slate-800">
                  {k}
                </kbd>
                <span className="ml-1">{v}</span>
              </span>
            ))}
          </div>
        </div>
        <WorkloadPanel workloads={workloads} highlightTeacherIds={selectionTeacherIds} />
      </div>

      {picker && (
        <TeacherPicker
          open
          onClose={() => setPicker(null)}
          cells={picker.cells}
          subjects={meta.subjects}
          teachers={meta.teachers}
          workloads={workloads}
          addedPeriods={pickerAddedPeriods}
          onPick={(id) => {
            if (!busy) void assignTeacher(id)
          }}
        />
      )}

      <CurriculumDialog
        open={curriculumOpen}
        onClose={() => setCurriculumOpen(false)}
        grades={meta.grades}
        stages={meta.stages}
        subjects={meta.subjects}
        defaultGradeIds={
          gradeFilter === 'all' ? meta.grades.map((g) => g.id) : [gradeFilter as number]
        }
        onApply={applyCurriculum}
      />
    </div>
  )
}

function EmptyHint({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="mx-auto max-w-xl rounded-card border border-dashed border-[color:var(--border-subtle)] p-10 text-center text-sm text-[color:var(--text-secondary)]">
      {text}
    </div>
  )
}
