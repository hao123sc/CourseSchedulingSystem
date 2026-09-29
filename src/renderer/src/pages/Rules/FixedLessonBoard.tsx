import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@renderer/lib/api'
import { useMetaStore } from '@renderer/stores/metaStore'
import { toast } from '@renderer/stores/toastStore'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import { Modal } from '@renderer/components/ui/modal'
import {
  ResourceScheduleGrid,
  type CellStat,
  type GridEntry
} from '@renderer/components/rules/ResourceScheduleGrid'
import { cn } from '@renderer/lib/utils'
import {
  ROOM_TYPES,
  WEEKDAY_NAMES,
  labelOf,
  type FixedLessonKind,
  type RuleValue
} from '@shared/domain'
import {
  checkFixedLessonAgainst,
  resolveRuleValue,
  type FixedLessonContext,
  type RuleQueryContext,
  type ScopedRule
} from '@shared/constraints'
import type {
  FixedLesson,
  FixedLessonInput,
  TeachingTask,
  TimeRule,
  TimeSlot
} from '@shared/types/entities'

/**
 * 从教学任务里抽出的「谁教谁什么」关系，用来把弹窗里的下拉收敛到合理范围。
 *
 * 不做成硬过滤：预排里有代课、活动课、临时借班这类课表外情况，
 * 相关项排在前面分组，其余仍可选，但选了对不上的组合会当场提示。
 */
export interface TaskIndex {
  /** classId → 该班有教学任务的学科 */
  subjectsOfClass: Map<number, number[]>
  /** `classId#subjectId` → 任课教师 */
  teachersOfClassSubject: Map<string, number[]>
  /** classId → 教这个班的全部教师 */
  teachersOfClass: Map<number, number[]>
  /** teacherId → 他任教的班 */
  classesOfTeacher: Map<number, number[]>
  /** `teacherId#classId` → 他在这个班教的学科 */
  subjectsOfTeacherInClass: Map<string, number[]>
  /** `classId#subjectId` → 该教学任务绑定的固定教室 */
  roomOfClassSubject: Map<string, number>
}

const pairKey = (a: number | string, b: number | string): string => `${a}#${b}`

function pushUnique<K>(m: Map<K, number[]>, k: K, v: number): void {
  const arr = m.get(k)
  if (!arr) m.set(k, [v])
  else if (!arr.includes(v)) arr.push(v)
}

function buildTaskIndex(tasks: TeachingTask[]): TaskIndex {
  const idx: TaskIndex = {
    subjectsOfClass: new Map(),
    teachersOfClassSubject: new Map(),
    teachersOfClass: new Map(),
    classesOfTeacher: new Map(),
    subjectsOfTeacherInClass: new Map(),
    roomOfClassSubject: new Map()
  }
  for (const t of tasks) {
    pushUnique(idx.subjectsOfClass, t.classId, t.subjectId)
    if (t.fixedRoomId != null) {
      idx.roomOfClassSubject.set(pairKey(t.classId, t.subjectId), t.fixedRoomId)
    }
    if (t.teacherId == null) continue
    pushUnique(idx.teachersOfClassSubject, pairKey(t.classId, t.subjectId), t.teacherId)
    pushUnique(idx.teachersOfClass, t.classId, t.teacherId)
    pushUnique(idx.classesOfTeacher, t.teacherId, t.classId)
    pushUnique(idx.subjectsOfTeacherInClass, pairKey(t.teacherId, t.classId), t.subjectId)
  }
  return idx
}

export type BoardMode = 'classroom' | 'teacher' | 'class'

interface Props {
  semesterId: number
  mode: BoardMode
  /** 本学期全部预排占位，由 FixedLessonTab 统一持有 */
  rows: FixedLesson[]
  /** 命中冲突判定的记录 id */
  conflictIds: Set<number>
  onChanged: () => void
}

const MODE_META: Record<BoardMode, { title: string; empty: string; searchHint: string }> = {
  classroom: {
    title: '教室 / 场地',
    empty: '左侧选一间教室，右侧就是它这一周的占用情况',
    searchHint: '搜教室名或楼栋'
  },
  teacher: {
    title: '教师',
    empty: '左侧选一位教师，右侧就是他这一周被占掉的节次',
    searchHint: '搜教师姓名或工号'
  },
  class: {
    title: '班级',
    empty: '左侧选一个班，右侧就是这个班被钉死的节次',
    searchHint: '搜班级名'
  }
}

/**
 * 预排锁定的「资源视角」编辑台：先选一个教室 / 教师 / 班级，
 * 再在它的一周课表上点格子录入 —— 与原来「先选班级、再勾一堆时段」的
 * 批量弹窗互补。机房、实验室、体育场地这类稀缺资源，教务的心智模型
 * 本来就是「打开这间房的课表，看哪节空着」。
 */
export function FixedLessonBoard({
  semesterId,
  mode,
  rows,
  conflictIds,
  onChanged
}: Props): React.JSX.Element {
  const meta = useMetaStore()
  const [resourceId, setResourceId] = useState<number | null>(null)
  const [stageId, setStageId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [roomType, setRoomType] = useState<string>('')
  const [timeRules, setTimeRules] = useState<TimeRule[]>([])
  const [tasks, setTasks] = useState<TeachingTask[]>([])
  const [editing, setEditing] = useState<{ slot: TimeSlot; row: FixedLesson | null } | null>(null)

  const gradeById = useMemo(() => new Map(meta.grades.map((g) => [g.id, g])), [meta.grades])
  const classById = useMemo(() => new Map(meta.classes.map((c) => [c.id, c])), [meta.classes])
  const subjectById = useMemo(() => new Map(meta.subjects.map((s) => [s.id, s])), [meta.subjects])
  const teacherById = useMemo(() => new Map(meta.teachers.map((t) => [t.id, t])), [meta.teachers])
  const roomById = useMemo(() => new Map(meta.classrooms.map((r) => [r.id, r])), [meta.classrooms])

  const slotById = useMemo(() => {
    const m = new Map<number, TimeSlot>()
    for (const list of Object.values(meta.slotsByStage)) for (const s of list) m.set(s.id, s)
    return m
  }, [meta.slotsByStage])

  // 叠加显示的时段规则：教室维度没有规则，只剩 global 兜底
  useEffect(() => {
    let alive = true
    void api['timeRule:listBySemester'](semesterId).then((r) => {
      if (alive) setTimeRules(r)
    })
    return () => {
      alive = false
    }
  }, [semesterId, rows])

  // 教学任务：用来让弹窗里的「班级 / 学科 / 教师」三个下拉互相收敛
  useEffect(() => {
    let alive = true
    void api['task:list'](semesterId).then((t) => {
      if (alive) setTasks(t)
    })
    return () => {
      alive = false
    }
  }, [semesterId])

  const taskIndex = useMemo(() => buildTaskIndex(tasks), [tasks])

  // ── 左侧资源候选 ──────────────────────────────────────────────────────
  const resources = useMemo(() => {
    const kw = search.trim().toLowerCase()
    const hit = (...fields: (string | null | undefined)[]): boolean =>
      kw === '' || fields.some((f) => (f ?? '').toLowerCase().includes(kw))
    if (mode === 'classroom') {
      return meta.classrooms
        .filter((r) => r.enabled)
        .filter((r) => roomType === '' || r.roomType === roomType)
        .filter((r) => hit(r.name, r.building))
        .map((r) => ({
          id: r.id,
          name: r.name,
          note: [labelOf(ROOM_TYPES, r.roomType), r.building].filter(Boolean).join(' · ')
        }))
    }
    if (mode === 'teacher') {
      return meta.teachers
        .filter((t) => t.enabled)
        .filter((t) => hit(t.name, t.staffNo))
        .map((t) => ({ id: t.id, name: t.name, note: t.staffNo ?? '' }))
    }
    return meta.classes
      .filter((c) => hit(c.name))
      .map((c) => ({ id: c.id, name: c.name, note: gradeById.get(c.gradeId)?.name ?? '' }))
  }, [mode, meta.classrooms, meta.teachers, meta.classes, search, roomType, gradeById])

  // 资源列表变化时挑一个可用的选中项
  useEffect(() => {
    setResourceId((prev) =>
      resources.some((r) => r.id === prev) ? prev : (resources[0]?.id ?? null)
    )
  }, [resources])

  // 班级视角：学段跟着班级走；其余视角用户自己切
  const myGradeId =
    mode === 'class' && resourceId != null ? classById.get(resourceId)?.gradeId : null
  useEffect(() => {
    if (mode === 'class') {
      const g = myGradeId != null ? gradeById.get(myGradeId) : undefined
      if (g) setStageId(g.stageId)
      return
    }
    setStageId((prev) => {
      if (prev != null && meta.stages.some((s) => s.id === prev)) return prev
      return (meta.stages.find((s) => s.enabled) ?? meta.stages[0])?.id ?? null
    })
  }, [mode, myGradeId, gradeById, meta.stages])

  const stage = meta.stages.find((s) => s.id === stageId)
  const slots = useMemo(
    () => (stageId != null ? (meta.slotsByStage[stageId] ?? []) : []),
    [stageId, meta.slotsByStage]
  )

  /** 该资源名下的全部占位（不分学段） */
  const mine = useMemo(() => {
    if (resourceId == null) return []
    return rows.filter((r) => {
      if (mode === 'classroom') return r.classroomId === resourceId
      if (mode === 'teacher') return r.teacherId === resourceId
      // 班级视角要把整年级占位展开进来，否则看不到升旗
      return r.classId === resourceId || (r.gradeId != null && r.gradeId === myGradeId)
    })
  }, [rows, resourceId, mode, myGradeId])

  /** 每个资源已有多少占位，显示在左侧列表上 */
  const countByResource = useMemo(() => {
    const m = new Map<number, number>()
    const bump = (id: number | null | undefined): void => {
      if (id == null) return
      m.set(id, (m.get(id) ?? 0) + 1)
    }
    for (const r of rows) {
      if (mode === 'classroom') bump(r.classroomId)
      else if (mode === 'teacher') bump(r.teacherId)
      else {
        bump(r.classId)
        if (r.gradeId != null) for (const c of meta.classes) if (c.gradeId === r.gradeId) bump(c.id)
      }
    }
    return m
  }, [rows, mode, meta.classes])

  const describe = useCallback(
    (r: FixedLesson): GridEntry => {
      const subject = r.subjectId != null ? subjectById.get(r.subjectId)?.name : null
      const teacher = r.teacherId != null ? teacherById.get(r.teacherId)?.name : null
      const room = r.classroomId != null ? roomById.get(r.classroomId)?.name : null
      const owner =
        r.gradeId != null
          ? `${gradeById.get(r.gradeId)?.name ?? '年级'} 整年级`
          : (classById.get(r.classId ?? -1)?.name ?? '—')
      const isGrade = r.gradeId != null

      if (r.kind === 'block') {
        return {
          id: r.id,
          kind: 'block',
          title: r.label ?? '占用',
          subtitle: mode === 'classroom' ? (teacher ?? '场地不可用') : (room ?? '教师不可用')
        }
      }
      const parts =
        mode === 'class'
          ? [teacher, room]
          : mode === 'teacher'
            ? [subject, room]
            : [subject, teacher]
      const title = mode === 'class' ? (subject ?? r.label ?? '预排课') : owner
      const detail = parts.filter(Boolean).join(' · ')
      return {
        id: r.id,
        kind: 'lesson',
        title,
        // 标题已经把 label 用掉了就别再重复一遍（升旗仪式 / 升旗仪式）
        subtitle: detail || (title === r.label ? null : r.label),
        conflict: conflictIds.has(r.id),
        readOnly: isGrade
      }
    },
    [mode, subjectById, teacherById, roomById, gradeById, classById, conflictIds]
  )

  const entriesBySlot = useMemo(() => {
    const m = new Map<number, GridEntry[]>()
    for (const r of mine) {
      if (slotById.get(r.slotId)?.stageId !== stageId) continue
      const arr = m.get(r.slotId) ?? []
      arr.push(describe(r))
      m.set(r.slotId, arr)
    }
    return m
  }, [mine, slotById, stageId, describe])

  /** 教室视角：班位占用 = lesson 按覆盖班数计，block 吃满容量（与冲突判定同口径） */
  const statOf = useCallback(
    (slotId: number): CellStat | null => {
      if (mode !== 'classroom' || resourceId == null) return null
      const cap = roomById.get(resourceId)?.concurrentCapacity ?? 1
      let used = 0
      for (const r of mine) {
        if (r.slotId !== slotId) continue
        if (r.kind === 'block') used += cap
        else if (r.gradeId != null)
          used += meta.classes.filter((c) => c.gradeId === r.gradeId).length || 1
        else used += 1
      }
      return { used, cap }
    },
    [mode, resourceId, roomById, mine, meta.classes]
  )

  /** 同一天同一节次上，其它学段是否也占了这个资源 */
  const crossStageOf = useCallback(
    (dayOfWeek: number, periodIndex: number) => {
      if (mode === 'class') return null
      let count = 0
      const names = new Set<string>()
      for (const r of mine) {
        const s = slotById.get(r.slotId)
        if (!s || s.stageId === stageId) continue
        if (s.dayOfWeek !== dayOfWeek || s.periodIndex !== periodIndex) continue
        count += 1
        names.add(meta.stages.find((x) => x.id === s.stageId)?.name ?? '其它学段')
      }
      return count > 0 ? { count, label: [...names].join('、') } : null
    },
    [mode, mine, slotById, stageId, meta.stages]
  )

  /**
   * 叠加底色：四层规则的合并口径必须与引擎一致，
   * 所以直接调 shared/constraints 的唯一实现，不在这里另写一套。
   * 教室没有规则维度（time_rule.scope_type 无 classroom），空 ctx 只会命中 global。
   */
  const ruleBySlot = useMemo(() => {
    const m = new Map<number, RuleValue>()
    const ctx: RuleQueryContext =
      mode === 'teacher'
        ? { teacherId: resourceId }
        : mode === 'class'
          ? { classId: resourceId, gradeId: myGradeId ?? null }
          : {}
    const bySlot = new Map<number, ScopedRule[]>()
    for (const r of timeRules) {
      const arr = bySlot.get(r.slotId) ?? []
      arr.push(r)
      bySlot.set(r.slotId, arr)
    }
    for (const s of slots) {
      const hits = bySlot.get(s.id)
      if (!hits) continue
      const v = resolveRuleValue(hits, s.id, ctx)
      if (v !== 'NORMAL') m.set(s.id, v)
    }
    return m
  }, [mode, timeRules, resourceId, myGradeId, slots])

  const conflictCount = useMemo(
    () => mine.filter((r) => conflictIds.has(r.id)).length,
    [mine, conflictIds]
  )

  const openCell = (slot: TimeSlot): void => setEditing({ slot, row: null })
  const openEntry = (entry: GridEntry, slot: TimeSlot): void => {
    if (entry.readOnly) {
      toast.info('这是整年级占位，请到「列表」视图统一编辑或删除')
      return
    }
    const row = rows.find((r) => r.id === entry.id) ?? null
    setEditing({ slot, row })
  }

  const meta2 = MODE_META[mode]

  return (
    <div className="flex min-h-[28rem] flex-col gap-3 lg:flex-row">
      {/* 左：资源列表 */}
      <div className="flex w-full shrink-0 flex-col gap-2 lg:w-60">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={meta2.searchHint}
          className="h-8 text-xs"
        />
        {mode === 'classroom' && (
          <Select
            value={roomType}
            onChange={(e) => setRoomType(e.target.value)}
            className="h-8 text-xs"
          >
            <option value="">全部类型</option>
            {ROOM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        )}
        <div className="max-h-[32rem] flex-1 overflow-y-auto rounded-card border border-[color:var(--border-subtle)]">
          {resources.length === 0 && (
            <p className="p-4 text-center text-xs text-[color:var(--text-secondary)]">
              没有匹配的{meta2.title}
            </p>
          )}
          {resources.map((r) => {
            const n = countByResource.get(r.id) ?? 0
            const on = r.id === resourceId
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setResourceId(r.id)}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-[color:var(--border-subtle)] px-2.5 py-1.5 text-left text-xs transition-colors last:border-b-0',
                  on
                    ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
              >
                <span className="flex-1 truncate">
                  {r.name}
                  {r.note && (
                    <span className="ml-1 text-[10px] font-normal text-[color:var(--text-secondary)]">
                      {r.note}
                    </span>
                  )}
                </span>
                {n > 0 && (
                  <span className="shrink-0 rounded-full bg-brand-600 px-1.5 text-[10px] text-white">
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 右：网格 */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {resourceId == null ? (
          <div className="flex h-48 items-center justify-center rounded-card border border-dashed border-[color:var(--border-subtle)] text-sm text-[color:var(--text-secondary)]">
            {meta2.empty}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {mode !== 'class' && (
                <Select
                  value={stageId ?? ''}
                  onChange={(e) => setStageId(Number(e.target.value))}
                  className="h-8 w-32 text-xs"
                >
                  {meta.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.enabled ? '' : '（停用）'}
                    </option>
                  ))}
                </Select>
              )}
              <span className="text-[color:var(--text-secondary)]">
                点空格新增 · 点色块编辑
                {mode === 'classroom' &&
                  `；该场地并发容量 ${roomById.get(resourceId)?.concurrentCapacity ?? 1} 个班位`}
              </span>
              {conflictCount > 0 && <Badge tone="red">{conflictCount} 处冲突</Badge>}
              <span className="ml-auto flex items-center gap-2 text-[10px] text-[color:var(--text-secondary)]">
                <span className="inline-flex items-center gap-1">
                  <i className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-600" /> 预排课
                </span>
                <span className="inline-flex items-center gap-1">
                  <i className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-slate-400 bg-slate-100" />{' '}
                  仅占用
                </span>
                {mode !== 'class' && (
                  <span className="inline-flex items-center gap-1">
                    <i className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500" />{' '}
                    另一学段也有占用
                  </span>
                )}
              </span>
            </div>
            <ResourceScheduleGrid
              slots={slots}
              daysPerWeek={stage?.daysPerWeek ?? 5}
              entriesBySlot={entriesBySlot}
              ruleBySlot={ruleBySlot}
              statOf={statOf}
              crossStageOf={crossStageOf}
              onCellClick={openCell}
              onEntryClick={openEntry}
            />
          </>
        )}
      </div>

      {editing && resourceId != null && (
        <CellEditor
          semesterId={semesterId}
          mode={mode}
          resourceId={resourceId}
          slot={editing.slot}
          row={editing.row}
          rows={rows}
          taskIndex={taskIndex}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function CellEditor({
  semesterId,
  mode,
  resourceId,
  slot,
  row,
  rows,
  taskIndex,
  onClose,
  onSaved
}: {
  semesterId: number
  mode: BoardMode
  resourceId: number
  slot: TimeSlot
  row: FixedLesson | null
  rows: FixedLesson[]
  taskIndex: TaskIndex
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const meta = useMetaStore()
  // 班级视角不存在「仅占用」：block 按定义就不绑班级
  const allowBlock = mode !== 'class'
  const [kind, setKind] = useState<FixedLessonKind>(row?.kind ?? 'lesson')
  const [classId, setClassId] = useState<number | ''>(
    row?.classId ?? (mode === 'class' ? resourceId : '')
  )
  const [subjectId, setSubjectId] = useState<number | ''>(row?.subjectId ?? '')
  const [teacherId, setTeacherId] = useState<number | ''>(
    row?.teacherId ?? (mode === 'teacher' ? resourceId : '')
  )
  const [classroomId, setClassroomId] = useState<number | ''>(
    row?.classroomId ?? (mode === 'classroom' ? resourceId : '')
  )
  const [label, setLabel] = useState(row?.label ?? '')
  const [busy, setBusy] = useState(false)
  const [forced, setForced] = useState(false)

  const gradeById = useMemo(() => new Map(meta.grades.map((g) => [g.id, g])), [meta.grades])

  /** 只列出与这张网格同学段的班级，避免把初中的班排进高中的作息 */
  const classOptions = useMemo(
    () => meta.classes.filter((c) => gradeById.get(c.gradeId)?.stageId === slot.stageId),
    [meta.classes, gradeById, slot.stageId]
  )

  // ── 三个下拉的「相关项」：按教学任务收敛，不相关的仍可选但排到后面一组 ──
  const relatedClassIds = useMemo(() => {
    if (mode !== 'teacher') return null
    return new Set(taskIndex.classesOfTeacher.get(resourceId) ?? [])
  }, [mode, resourceId, taskIndex])

  const relatedSubjectIds = useMemo(() => {
    if (mode === 'teacher' && classId !== '') {
      return new Set(taskIndex.subjectsOfTeacherInClass.get(`${resourceId}#${classId}`) ?? [])
    }
    if (classId !== '') return new Set(taskIndex.subjectsOfClass.get(Number(classId)) ?? [])
    return null
  }, [mode, resourceId, classId, taskIndex])

  /** 该班该科的任课教师；只选了班级时退化为「教这个班的所有老师」 */
  const relatedTeacherIds = useMemo(() => {
    if (classId === '') return null
    if (subjectId !== '') {
      return new Set(taskIndex.teachersOfClassSubject.get(`${classId}#${subjectId}`) ?? [])
    }
    return new Set(taskIndex.teachersOfClass.get(Number(classId)) ?? [])
  }, [classId, subjectId, taskIndex])

  /**
   * 选定「班级 + 学科」后自动带出任课教师。
   * 唯一就直接填；原来的选择明显对不上（不在任课名单里）就清掉让人重选。
   * 用函数式更新读最新值，避免把 teacherId 放进依赖导致来回打架。
   */
  useEffect(() => {
    if (kind !== 'lesson' || mode === 'teacher') return
    if (classId === '' || subjectId === '') return
    const cands = taskIndex.teachersOfClassSubject.get(`${classId}#${subjectId}`) ?? []
    if (cands.length === 0) return
    setTeacherId((prev) => {
      if (cands.length === 1) return cands[0]
      if (prev !== '' && !cands.includes(Number(prev))) return ''
      return prev
    })
  }, [classId, subjectId, kind, mode, taskIndex])

  /** 该教学任务若绑了固定教室，教室没填时一并带出来 */
  useEffect(() => {
    if (kind !== 'lesson' || mode === 'classroom') return
    if (classId === '' || subjectId === '') return
    const room = taskIndex.roomOfClassSubject.get(`${classId}#${subjectId}`)
    if (room == null) return
    setClassroomId((prev) => (prev === '' ? room : prev))
  }, [classId, subjectId, kind, mode, taskIndex])

  /** 组合不符合教学任务时的温和提示（不拦保存，代课/活动课是合理场景） */
  const hints = useMemo(() => {
    if (kind !== 'lesson') return []
    const out: string[] = []
    const nameOf = (list: { id: number; name: string }[], id: number | ''): string =>
      list.find((x) => x.id === id)?.name ?? '所选项'
    if (classId !== '' && subjectId !== '') {
      const cands = taskIndex.teachersOfClassSubject.get(`${classId}#${subjectId}`) ?? []
      if (cands.length === 0) {
        out.push(
          `${nameOf(meta.classes, classId)} 没有「${nameOf(meta.subjects, subjectId)}」的教学任务，` +
            `确认要在这里排吗？`
        )
      } else if (teacherId !== '' && !cands.includes(Number(teacherId))) {
        out.push(
          `${nameOf(meta.teachers, teacherId)} 不是 ${nameOf(meta.classes, classId)} ` +
            `「${nameOf(meta.subjects, subjectId)}」的任课教师（应为 ` +
            `${cands.map((id) => nameOf(meta.teachers, id)).join('、')}）`
        )
      }
    }
    if (mode === 'teacher' && classId !== '' && !(relatedClassIds?.has(Number(classId)) ?? true)) {
      out.push(
        `${nameOf(meta.teachers, resourceId)} 在教学任务里没有带 ${nameOf(meta.classes, classId)}`
      )
    }
    return out
  }, [
    kind,
    mode,
    classId,
    subjectId,
    teacherId,
    resourceId,
    relatedClassIds,
    taskIndex,
    meta.classes,
    meta.subjects,
    meta.teachers
  ])

  const ctx: FixedLessonContext = useMemo(() => {
    const classGrade = new Map<number, number>()
    const gradeClasses = new Map<number, number[]>()
    for (const c of meta.classes) {
      classGrade.set(c.id, c.gradeId)
      const arr = gradeClasses.get(c.gradeId) ?? []
      arr.push(c.id)
      gradeClasses.set(c.gradeId, arr)
    }
    return {
      classGrade,
      gradeClasses,
      roomConcurrency: new Map(meta.classrooms.map((r) => [r.id, r.concurrentCapacity]))
    }
  }, [meta.classes, meta.classrooms])

  const payload: FixedLessonInput = {
    ...(row?.id != null ? { id: row.id } : {}),
    semesterId,
    kind,
    classId: kind === 'block' ? null : classId === '' ? null : Number(classId),
    gradeId: null,
    subjectId: kind === 'block' ? null : subjectId === '' ? null : Number(subjectId),
    teacherId: teacherId === '' ? null : Number(teacherId),
    classroomId: classroomId === '' ? null : Number(classroomId),
    slotId: slot.id,
    label: label.trim() || null
  }

  // 落库前当场试算，别等到 M3 排课才报无解
  const issues = useMemo(
    () =>
      checkFixedLessonAgainst(
        {
          id: row?.id,
          kind: payload.kind,
          classId: payload.classId ?? null,
          gradeId: null,
          teacherId: payload.teacherId ?? null,
          classroomId: payload.classroomId ?? null,
          slotId: slot.id
        },
        rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          classId: r.classId,
          gradeId: r.gradeId,
          teacherId: r.teacherId,
          classroomId: r.classroomId,
          slotId: r.slotId
        })),
        ctx
      ),
    [
      payload.kind,
      payload.classId,
      payload.teacherId,
      payload.classroomId,
      row?.id,
      rows,
      ctx,
      slot.id
    ]
  )
  const blocking = issues.filter((i) => i.kind === 'invalid')
  const warning = issues.filter((i) => i.kind !== 'invalid')

  useEffect(() => setForced(false), [issues.length])

  const save = async (): Promise<void> => {
    if (blocking.length > 0) return
    setBusy(true)
    try {
      await api['fixedLesson:upsert'](payload)
      toast.success(row ? '已更新占位' : '已新增占位')
      onSaved()
    } catch (err) {
      toast.error(`保存失败：${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!row) return
    setBusy(true)
    try {
      await api['fixedLesson:delete'](row.id)
      toast.success('已删除占位')
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  const where = `周${WEEKDAY_NAMES[slot.dayOfWeek - 1]} ${slot.periodName}`
  const lockedName =
    mode === 'classroom'
      ? meta.classrooms.find((r) => r.id === resourceId)?.name
      : mode === 'teacher'
        ? meta.teachers.find((t) => t.id === resourceId)?.name
        : meta.classes.find((c) => c.id === resourceId)?.name

  const canSave = blocking.length === 0 && (warning.length === 0 || forced)

  return (
    <Modal
      open
      onClose={onClose}
      title={`${lockedName ?? ''} · ${where}`}
      description={row ? '编辑这条预排占位' : '在这一格新增预排占位'}
      className="max-w-lg"
      footer={
        <>
          {row && (
            <Button variant="ghost" onClick={() => void remove()} disabled={busy}>
              删除
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={busy || !canSave}>
            {busy ? '保存中…' : warning.length > 0 && forced ? '仍要保存' : '保存'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {allowBlock && (
          <div className="flex gap-1">
            {(
              [
                { v: 'lesson' as const, label: '预排一节课', hint: '钉死某个班的某节课' },
                {
                  v: 'block' as const,
                  label: '仅占用',
                  hint:
                    mode === 'classroom'
                      ? '场地维护、外借：该时段整间教室不可用'
                      : '开会、外出：该教师这一节不排课'
                }
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                type="button"
                title={t.hint}
                onClick={() => setKind(t.v)}
                className={cn(
                  'flex-1 rounded-btn border px-2.5 py-1.5 text-xs transition-colors',
                  kind === t.v
                    ? 'border-brand-600 bg-brand-50 font-medium text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                    : 'border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:border-slate-400'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <p className="rounded-card bg-slate-50 px-2.5 py-1.5 text-xs text-[color:var(--text-secondary)] dark:bg-slate-800/60">
          {kind === 'block'
            ? mode === 'classroom'
              ? '这一节整间教室不可用，排课时不会把任何班安排进来；不产生课，也不占用任何班级的课时。'
              : '这位教师这一节不排课；不产生课，也不占用任何班级的课时。'
            : '这一节会被钉死，排课时不可侵占（硬约束 H7），同时占用班级、教师和场地。'}
        </p>

        {kind === 'lesson' && (
          <Row label="班级">
            <Select
              value={classId}
              onChange={(e) => setClassId(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={mode === 'class'}
              className="h-8 text-xs"
            >
              <option value="">请选择班级</option>
              <GroupedOptions
                items={classOptions}
                related={relatedClassIds}
                relatedLabel="该教师任教的班"
                otherLabel="其他班级"
              />
            </Select>
          </Row>
        )}

        {kind === 'lesson' && (
          <Row label="学科">
            <Select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value === '' ? '' : Number(e.target.value))}
              className="h-8 text-xs"
            >
              <option value="">不指定学科</option>
              <GroupedOptions
                items={meta.subjects}
                related={relatedSubjectIds}
                relatedLabel="该班开设的学科"
                otherLabel="其他学科"
              />
            </Select>
          </Row>
        )}

        <Row label="教师">
          <Select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={mode === 'teacher'}
            className="h-8 text-xs"
          >
            <option value="">不指定教师</option>
            <GroupedOptions
              items={meta.teachers.filter((t) => t.enabled)}
              related={kind === 'lesson' ? relatedTeacherIds : null}
              relatedLabel={subjectId === '' ? '教这个班的老师' : '该班该科任课教师'}
              otherLabel="其他教师"
            />
          </Select>
        </Row>

        <Row label="教室">
          <Select
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={mode === 'classroom'}
            className="h-8 text-xs"
          >
            <option value="">不指定教室</option>
            {meta.classrooms
              .filter((r) => r.enabled)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </Select>
        </Row>

        <Row label="名称">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === 'block' ? '如：设备维护 / 教研例会' : '如：信息技术 / 班会'}
            className="h-8 text-xs"
          />
        </Row>

        {hints.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-card border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {hints.map((h, i) => (
              <li key={i}>· {h}</li>
            ))}
          </ul>
        )}

        {issues.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-card border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {issues.map((c, i) => (
              <li key={i}>· {c.message}</li>
            ))}
            {blocking.length === 0 && (
              <li className="mt-1">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={forced}
                    onChange={(e) => setForced(e.target.checked)}
                  />
                  我确认要这样排，忽略上述冲突
                </label>
              </li>
            )}
          </ul>
        )}
      </div>
    </Modal>
  )
}

/**
 * 把候选项拆成「相关」「其他」两组。相关组排在前面，
 * 既把人往对的选项上引，又不封死代课、活动课这类课表外的情况。
 */
function GroupedOptions({
  items,
  related,
  relatedLabel,
  otherLabel
}: {
  items: { id: number; name: string }[]
  related: Set<number> | null
  relatedLabel: string
  otherLabel: string
}): React.JSX.Element {
  if (related == null || related.size === 0) {
    return (
      <>
        {items.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </>
    )
  }
  const hit = items.filter((o) => related.has(o.id))
  const rest = items.filter((o) => !related.has(o.id))
  return (
    <>
      <optgroup label={relatedLabel}>
        {hit.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </optgroup>
      {rest.length > 0 && (
        <optgroup label={otherLabel}>
          {rest.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-[color:var(--text-secondary)]">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}
