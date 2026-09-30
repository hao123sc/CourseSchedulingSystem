import { useEffect, useMemo, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/stores/toastStore'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { useMetaStore } from '@renderer/stores/metaStore'
import type { FixedLesson, Lesson, ScheduleVersion } from '@shared/types/entities'
import { Button } from '@renderer/components/ui/button'
import {
  buildEntityGrid,
  buildSlotAxis,
  teacherGapSlots,
  type GridLesson,
  type TTView
} from './timetableModel'
import { TimetableGrid } from '@renderer/components/timetable/TimetableGrid'
import { OverviewSheet } from '@renderer/components/timetable/OverviewSheet'

/**
 * 课表页（M4 · docs/05 §4.5 + docs/mockups/timetable.html / overview.html 定稿）。
 * 班级 / 教师 / 教室 / 全校总表四个视图；学科配色取自学科库 color；
 * 预排无学科占位（升旗、早读、晚自习、班会）叠加显示为灰块。
 * 拖拽换课、换课建议、撤销重做、综合评分属 M5/M6，按钮先占位置灰。
 */
const VIEW_TABS: { key: TTView; label: string }[] = [
  { key: 'class', label: '班级课表' },
  { key: 'teacher', label: '教师课表' },
  { key: 'room', label: '教室课表' },
  { key: 'overview', label: '全校总表' }
]

export function TimetablePage(): React.JSX.Element {
  const { currentSemester, loaded, load } = useSchoolStore()
  const meta = useMetaStore()
  const semesterId = currentSemester?.id ?? null

  const [versions, setVersions] = useState<ScheduleVersion[]>([])
  const [versionId, setVersionId] = useState<number | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [fixed, setFixed] = useState<FixedLesson[]>([])
  const [loadingData, setLoadingData] = useState(false)

  const [view, setView] = useState<TTView>('class')
  const [stageId, setStageId] = useState<number | null>(null)
  const [targetId, setTargetId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GridLesson | null>(null)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  useEffect(() => {
    if (semesterId != null) void meta.load(semesterId)
  }, [semesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 版本列表 + 预排占位（学期切换时重拉）
  useEffect(() => {
    if (semesterId == null) return
    let alive = true
    setVersions([])
    setVersionId(null)
    setLessons([])
    api['schedule:listVersions'](semesterId)
      .then((rows) => {
        if (!alive) return
        const sorted = [...rows].sort((a, b) => b.id - a.id)
        setVersions(sorted)
        setVersionId(sorted[0]?.id ?? null)
      })
      .catch((e) => toast.error(`读取课表版本失败：${String(e)}`))
    api['fixedLesson:list'](semesterId)
      .then((rows) => alive && setFixed(rows))
      .catch(() => alive && setFixed([]))
    return () => {
      alive = false
    }
  }, [semesterId])

  // 版本课表行
  useEffect(() => {
    if (versionId == null) {
      setLessons([])
      return
    }
    setLoadingData(true)
    let alive = true
    api['timetable:versionLessons'](versionId)
      .then((rows) => alive && setLessons(rows))
      .catch((e) => {
        if (alive) {
          toast.error(`读取课表数据失败：${String(e)}`)
          setLessons([])
        }
      })
      .finally(() => alive && setLoadingData(false))
    return () => {
      alive = false
    }
  }, [versionId])

  const version = versions.find((v) => v.id === versionId) ?? null

  // ── 学段 / 班级 / 实体候选 ──
  const gradeById = useMemo(() => new Map(meta.grades.map((g) => [g.id, g])), [meta.grades])
  const stageOfClass = useMemo(() => {
    const m = new Map<number, number>()
    for (const c of meta.classes) {
      const sid = gradeById.get(c.gradeId)?.stageId
      if (sid != null) m.set(c.id, sid)
    }
    return m
  }, [meta.classes, gradeById])

  /** 学段选择器候选：只列有班级的学段（都没有时退回全部，避免空列表） */
  const selectableStages = useMemo(() => {
    const used = new Set(stageOfClass.values())
    const withClasses = meta.stages.filter((s) => used.has(s.id))
    return withClasses.length > 0 ? withClasses : meta.stages
  }, [meta.stages, stageOfClass])

  const defaultStageId = selectableStages[0]?.id ?? null

  /** 有课的教师 / 在用的教室（默认实体优先挑有数据的，避免一进来是空表） */
  const busyTeacherIds = useMemo(
    () => new Set(lessons.map((l) => l.teacherId).filter((t) => t != null)),
    [lessons]
  )
  const busyRoomIds = useMemo(
    () => new Set(lessons.map((l) => l.classroomId).filter((r) => r != null)),
    [lessons]
  )

  /** 默认实体：第一个班级 / 第一个有课的教师 / 第一个在用的教室（数据异步到齐后由派生值兜底） */
  const defaultTargetId = useMemo(() => {
    if (view === 'class') return meta.classes[0]?.id ?? null
    if (view === 'teacher') {
      return (
        meta.teachers.find((t) => t.enabled && busyTeacherIds.has(t.id))?.id ??
        meta.teachers.find((t) => t.enabled)?.id ??
        null
      )
    }
    if (view === 'room') {
      return (
        meta.classrooms.find((r) => r.enabled && busyRoomIds.has(r.id))?.id ??
        meta.classrooms.find((r) => r.enabled)?.id ??
        null
      )
    }
    return null
  }, [view, meta.classes, meta.teachers, meta.classrooms, busyTeacherIds, busyRoomIds])

  const targetValid =
    targetId != null &&
    (view === 'class'
      ? meta.classes.some((c) => c.id === targetId)
      : view === 'teacher'
        ? meta.teachers.some((t) => t.id === targetId && t.enabled)
        : view === 'room'
          ? meta.classrooms.some((r) => r.id === targetId && r.enabled)
          : false)

  const resolvedTargetId = targetValid ? targetId : defaultTargetId

  /** 教师 / 教室视图的轴默认跟着其实际课表所在学段走，而不是学段列表第一项 */
  const stageByUsage = useMemo(() => {
    if (view !== 'teacher' && view !== 'room') return null
    if (resolvedTargetId == null || lessons.length === 0) return null
    const counts = new Map<number, number>()
    for (const l of lessons) {
      if (
        view === 'teacher' ? l.teacherId !== resolvedTargetId : l.classroomId !== resolvedTargetId
      )
        continue
      const sid = stageOfClass.get(l.classId)
      if (sid != null) counts.set(sid, (counts.get(sid) ?? 0) + 1)
    }
    let best: number | null = null
    let max = 0
    for (const [sid, n] of counts) {
      if (n > max) {
        max = n
        best = sid
      }
    }
    return best
  }, [view, resolvedTargetId, lessons, stageOfClass])

  const activeStageId = useMemo(() => {
    if (view === 'class') {
      if (resolvedTargetId != null) return stageOfClass.get(resolvedTargetId) ?? defaultStageId
      return defaultStageId
    }
    if (view === 'overview') return stageId ?? defaultStageId
    return stageId ?? stageByUsage ?? defaultStageId
  }, [view, resolvedTargetId, stageId, stageByUsage, stageOfClass, defaultStageId])

  const stageClasses = useMemo(
    () => meta.classes.filter((c) => stageOfClass.get(c.id) === activeStageId),
    [meta.classes, stageOfClass, activeStageId]
  )

  // 视图切换：清掉手选实体 / 手选学段，回到派生默认
  useEffect(() => {
    setTargetId(null)
    setStageId(null)
    setSelected(null)
    setSearch('')
  }, [view])

  const axis = useMemo(
    () => (activeStageId != null ? buildSlotAxis(meta.slotsByStage[activeStageId] ?? []) : null),
    [meta.slotsByStage, activeStageId]
  )

  const grid = useMemo(
    () =>
      view !== 'overview' && axis && resolvedTargetId != null && lessons.length + fixed.length > 0
        ? buildEntityGrid(view, resolvedTargetId, lessons, fixed, axis, meta)
        : null,
    [axis, resolvedTargetId, view, lessons, fixed, meta]
  )

  const gaps = useMemo(
    () => (grid && view === 'teacher' && axis ? teacherGapSlots(grid, axis) : null),
    [grid, view, axis]
  )

  // ── 侧栏列表 ──
  const sidebar = useMemo(() => {
    const q = search.trim()
    if (view === 'class') {
      // 班级视图侧栏列全学校班级（按年级分组，跨学段），选谁就以谁的学段作息渲染
      const items = meta.classes.filter((c) => !q || c.name.includes(q))
      const groups = [...new Set(items.map((c) => c.gradeId))].map((gid) => ({
        key: `g${gid}`,
        label: gradeById.get(gid)?.name ?? '',
        items: items.filter((c) => c.gradeId === gid).map((c) => ({ id: c.id, label: c.name }))
      }))
      return groups
    }
    if (view === 'teacher') {
      const subjectById = new Map(meta.subjects.map((s) => [s.id, s]))
      const items = meta.teachers
        .filter((t) => t.enabled)
        .filter(
          (t) =>
            !q ||
            t.name.includes(q) ||
            t.subjectIds.some((sid) => subjectById.get(sid)?.name.includes(q))
        )
      const groups = new Map<string, { id: number; label: string }[]>()
      for (const t of items) {
        const names = t.subjectIds.map((sid) => subjectById.get(sid)?.name).filter(Boolean)
        const key = names.length > 0 ? names.join(' / ') : '未分科'
        const arr = groups.get(key) ?? []
        arr.push({ id: t.id, label: t.name })
        groups.set(key, arr)
      }
      return [...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'zh'))
        .map(([key, items]) => ({ key, label: key, items }))
    }
    if (view === 'room') {
      const items = meta.classrooms
        .filter((r) => r.enabled)
        .filter((r) => !q || r.name.includes(q) || (r.building ?? '').includes(q))
      const groups = new Map<string, { id: number; label: string }[]>()
      for (const r of items) {
        const key = r.building || '未分楼'
        const arr = groups.get(key) ?? []
        arr.push({ id: r.id, label: r.name })
        groups.set(key, arr)
      }
      return [...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'zh'))
        .map(([key, items]) => ({ key, label: key, items }))
    }
    return []
  }, [view, search, meta.classes, meta.teachers, meta.classrooms, meta.subjects, gradeById])

  if (semesterId == null) {
    return (
      <div className="mx-auto max-w-xl rounded-card border border-dashed border-[color:var(--border-subtle)] p-10 text-center text-sm text-[color:var(--text-secondary)]">
        请先到「学校设置」创建并选择当前学期，再来查看课表。
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader semester={currentSemester?.name ?? ''} />
        <div className="mx-auto mt-16 max-w-md rounded-card border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--panel)] p-10 text-center">
          <div className="text-4xl">🗓️</div>
          <h2 className="mt-4 text-lg font-semibold">还没有排课结果</h2>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
            先到「开始排课」跑一次排课，生成的版本会出现在这里。
          </p>
          <Button className="mt-6 h-11" onClick={() => (window.location.hash = '#/scheduling')}>
            去排课
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        semester={currentSemester?.name ?? ''}
        version={version}
        versions={versions}
        onVersion={setVersionId}
      />

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-btn border border-[color:var(--border-subtle)] bg-[color:var(--panel)] p-0.5">
          {VIEW_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(t.key)}
              className={cn(
                'rounded-[7px] px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150',
                view === t.key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-[color:var(--text-2)] hover:text-[color:var(--text)]'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {view !== 'class' && selectableStages.length > 1 && (
          <Select
            value={activeStageId ?? undefined}
            onChange={(v) => setStageId(+v)}
            options={selectableStages.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}

        <div className="flex-1" />

        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium',
            version && version.hardViolations === 0
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
              : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
          )}
          title="硬约束违反（M5 体检报告出细项）"
        >
          硬约束 {version?.hardViolations ?? '—'}
        </span>
        <Button size="sm" disabled title="撤销 / 重做在 M6 交互调整开放">
          ↶ 撤销
        </Button>
        <Button size="sm" disabled title="撤销 / 重做在 M6 交互调整开放">
          ↷ 重做
        </Button>
        <Button size="sm" disabled title="导出在 M7 开放">
          ↥ 导出
        </Button>
      </div>

      {/* 主体三栏 */}
      <div className="flex min-h-0 flex-1 gap-3">
        {view !== 'overview' && (
          <aside className="flex w-44 shrink-0 flex-col rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--panel)]">
            <div className="border-b border-[color:var(--border-subtle)] p-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  view === 'class'
                    ? '搜索班级…'
                    : view === 'teacher'
                      ? '搜索教师 / 学科…'
                      : '搜索教室…'
                }
                className="w-full rounded-input border border-[color:var(--border-subtle)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-brand-600"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {sidebar.length === 0 && (
                <p className="p-3 text-center text-xs text-[color:var(--text-3)]">
                  {search.trim() ? '无匹配结果' : '本学期还没有数据'}
                </p>
              )}
              {sidebar.map((g) => (
                <div key={g.key} className="mb-2">
                  <p className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--text-3)]">
                    {g.label}
                  </p>
                  {g.items.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        setTargetId(it.id)
                        setStageId(null)
                        setSelected(null)
                      }}
                      className={cn(
                        'relative block w-full rounded-[7px] px-2 py-1.5 text-left text-[13px] transition-colors duration-150',
                        resolvedTargetId === it.id
                          ? 'bg-brand-50 pr-2 font-medium text-brand-700 dark:bg-brand-600/15 dark:text-brand-50'
                          : 'text-[color:var(--text-2)] hover:bg-[color:var(--panel-2)] hover:text-[color:var(--text)]'
                      )}
                    >
                      {resolvedTargetId === it.id && (
                        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-brand-600" />
                      )}
                      <span className="pl-2">{it.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </aside>
        )}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--panel)]">
          {view === 'overview' ? (
            stageClasses.length > 0 ? (
              <div className="flex min-h-0 flex-1 flex-col p-3">
                <OverviewSheet
                  classes={stageClasses}
                  grades={meta.grades.filter((g) => g.stageId === activeStageId)}
                  lessons={lessons}
                  fixed={fixed}
                  slots={meta.slotsByStage[activeStageId ?? -1] ?? []}
                  subjects={meta.subjects}
                  teachers={meta.teachers}
                  classrooms={meta.classrooms}
                  hardViolations={version?.hardViolations ?? 0}
                />
              </div>
            ) : (
              <div className="grid flex-1 place-items-center text-sm text-[color:var(--text-3)]">
                该学段暂无班级
              </div>
            )
          ) : (
            <>
              <GridHeader
                view={view}
                targetId={resolvedTargetId}
                grid={grid}
                gaps={gaps}
                loading={loadingData}
              />
              <div className="min-h-0 flex-1 overflow-auto p-4 pt-2" key={versionId ?? 'v'}>
                {axis && grid ? (
                  <TimetableGrid
                    axis={axis}
                    grid={grid}
                    view={view}
                    gapSlots={gaps?.gaps ?? new Set<number>()}
                    selected={selected}
                    onSelect={setSelected}
                    waterfall
                  />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-[color:var(--text-3)]">
                    {loadingData ? '正在载入课表…' : '本学期还没有班级 / 教室数据'}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {view !== 'overview' && (
          <aside className="w-60 shrink-0 overflow-y-auto">
            <StatsPanel
              view={view}
              lessons={lessons}
              grid={grid}
              axis={axis}
              targetId={resolvedTargetId}
              gaps={gaps}
            />
          </aside>
        )}
      </div>
    </div>
  )
}

function PageHeader({
  semester,
  version,
  versions,
  onVersion
}: {
  semester: string
  version?: ScheduleVersion | null
  versions?: ScheduleVersion[]
  onVersion?: (id: number) => void
}): React.JSX.Element {
  version = version ?? null
  versions = versions ?? []
  onVersion = onVersion ?? (() => {})
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">课表总览</h1>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          班级 / 教师 / 教室 / 全校总表 · {semester}
          {version?.solveMs != null && ` · 求解 ${version.solveMs}ms`}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
        版本
        <Select
          value={version?.id}
          onChange={(v) => onVersion(+v)}
          options={versions.map((v) => ({ value: v.id, label: v.name }))}
        />
      </label>
    </div>
  )
}

function Select({
  value,
  onChange,
  options
}: {
  value: number | undefined
  onChange: (v: string) => void
  options: { value: number; label: string }[]
}): React.JSX.Element {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-input border border-[color:var(--border-subtle)] bg-[color:var(--panel)] px-2 py-1.5 text-[13px] text-[color:var(--text)] outline-none focus:border-brand-600"
    >
      {options.length === 0 && <option value="">（无）</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function GridHeader({
  view,
  targetId,
  grid,
  gaps,
  loading
}: {
  view: TTView
  targetId: number | null
  grid: ReturnType<typeof buildEntityGrid> | null
  gaps: ReturnType<typeof teacherGapSlots> | null
  loading: boolean
}): React.JSX.Element {
  const meta = useMetaStore()
  if (targetId == null)
    return <div className="p-4 pb-0 text-sm text-[color:var(--text-3)]">未选择实体</div>
  const count = grid ? [...grid.lessonsBySlot.values()].reduce((n, a) => n + a.length, 0) : 0
  const sub = loading ? '载入中…' : `本周 ${count} 节`
  let title = ''
  let detail = ''
  if (view === 'class') {
    const c = meta.classes.find((x) => x.id === targetId)
    const ht =
      c?.headTeacherId != null ? meta.teachers.find((t) => t.id === c.headTeacherId)?.name : null
    const room =
      c?.homeRoomId != null ? meta.classrooms.find((r) => r.id === c.homeRoomId)?.name : null
    title = c?.name ?? '班级'
    detail = `${ht ? `班主任 ${ht} · ` : ''}${c?.studentCount ?? 0} 人${room ? ` · ${room}` : ''}`
  } else if (view === 'teacher') {
    const t = meta.teachers.find((x) => x.id === targetId)
    const names = (t?.subjectIds ?? [])
      .map((sid) => meta.subjects.find((s) => s.id === sid)?.name)
      .filter(Boolean)
      .join(' / ')
    const gapCount = [...(gaps?.gaps ?? [])].length
    title = t?.name ?? '教师'
    detail = `${names || '未分科'} · 空隙 ${gapCount} 节`
  } else {
    const r = meta.classrooms.find((x) => x.id === targetId)
    title = r?.name ?? '教室'
    detail = `${r?.roomType ?? ''} · 容量 ${r?.capacity ?? 0}`
  }
  return (
    <div className="flex items-baseline gap-3 px-4 pb-1 pt-3">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <span className="text-xs text-[color:var(--text-3)]">{detail}</span>
      <span className="ml-auto text-xs font-medium text-brand-600 dark:text-brand-50">{sub}</span>
    </div>
  )
}

function StatsPanel({
  view,
  lessons,
  grid,
  axis,
  targetId,
  gaps
}: {
  view: TTView
  lessons: Lesson[]
  grid: ReturnType<typeof buildEntityGrid> | null
  axis: ReturnType<typeof buildSlotAxis> | null
  targetId: number | null
  gaps: ReturnType<typeof teacherGapSlots> | null
}): React.JSX.Element {
  const stats = useMemo(() => {
    if (!grid || targetId == null || !axis) return []
    const blocks = [...grid.lessonsBySlot.values()].flat()
    const lessonBlocks = blocks.filter((b) => !b.overlay)
    const overlayBlocks = blocks.filter((b) => b.overlay)
    const groups = new Set(
      lessons
        .filter((l) =>
          view === 'class'
            ? l.classId === targetId
            : view === 'teacher'
              ? l.teacherId === targetId
              : l.classroomId === targetId
        )
        .map((l) => l.consecutiveGroup)
        .filter((g) => g != null)
    ).size
    const empty = axis.rows.filter(
      (r) => (grid.lessonsBySlot.get(r.slotId) ?? []).length === 0 && !grid.covered.has(r.slotId)
    ).length
    if (view === 'class') {
      return [
        { k: '周课时（含预排）', v: `${blocks.length} 节` },
        { k: '其中预排占位', v: `${overlayBlocks.length} 节` },
        { k: '连堂组', v: `${groups} 组` },
        { k: '锁定课', v: `${lessonBlocks.filter((b) => b.locked).length} 节` },
        { k: '空位', v: `${empty} 处` }
      ]
    }
    if (view === 'teacher') {
      const days = new Map<number, number>()
      for (const b of blocks) {
        const r = axis.rows.find((x) => x.slotId === b.slotId)
        if (r) days.set(r.day, (days.get(r.day) ?? 0) + 1)
      }
      const maxDay = Math.max(0, ...days.values())
      return [
        { k: '周课时', v: `${blocks.length} 节` },
        { k: '日均', v: `${(blocks.length / 5).toFixed(1)} 节` },
        { k: '最重一天', v: `${maxDay} 节` },
        { k: '空隙', v: `${gaps ? [...gaps.gaps].length : 0} 节` }
      ]
    }
    const roomLessons = lessons.filter((l) => l.classroomId === targetId)
    const classCount = new Set(roomLessons.map((l) => l.classId)).size
    const subjectCount = new Set(roomLessons.map((l) => l.subjectId)).size
    return [
      { k: '周占用', v: `${blocks.length} 节` },
      { k: '使用班级', v: `${classCount} 个` },
      { k: '涉及学科', v: `${subjectCount} 个` },
      { k: '空闲教学位', v: `${axis.rows.length - blocks.length} 个` }
    ]
  }, [grid, lessons, view, targetId, axis, gaps])

  const hint = useMemo(() => {
    if (view !== 'teacher') return null
    const byDay = gaps?.byDay
    if (!byDay || byDay.size === 0) return null
    const names = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
    return [...byDay.entries()].map(([d, n]) => `${names[d]} ${n}`).join(' · ')
  }, [view, gaps])

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--panel)] p-4">
        <h3 className="text-[13px] font-semibold">课时统计</h3>
        <p className="mt-0.5 text-[11px] text-[color:var(--text-3)]">
          本{view === 'class' ? '班' : view === 'teacher' ? '教师' : '教室'} · 当前版本
        </p>
        <div className="mt-3 flex flex-col gap-2.5">
          {stats.length === 0 && <p className="text-xs text-[color:var(--text-3)]">—</p>}
          {stats.map((s) => (
            <div key={s.k} className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-[color:var(--text-2)]">{s.k}</span>
              <b className="text-[13px] font-semibold tabular-nums">{s.v}</b>
            </div>
          ))}
        </div>
      </div>
      {hint && (
        <div className="rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--panel)] p-4">
          <h3 className="text-[13px] font-semibold">今日空隙</h3>
          <p className="mt-2 text-xs leading-5 text-[color:var(--text-2)]">{hint}</p>
          <p className="mt-2 text-[11px] leading-4 text-[color:var(--text-3)]">
            空隙 = 首末节课之间空着的教学节次（斜纹格）。
          </p>
        </div>
      )}
      <div className="rounded-card border border-dashed border-[color:var(--border-subtle)] p-4">
        <h3 className="text-[13px] font-semibold text-[color:var(--text-2)]">
          质量指标 · 换课建议
        </h3>
        <p className="mt-2 text-[11px] leading-4 text-[color:var(--text-3)]">
          综合评分与换课建议在 M5 质量优化 / M6 交互调整接入，当前版本先展示基础统计。
        </p>
      </div>
    </div>
  )
}
