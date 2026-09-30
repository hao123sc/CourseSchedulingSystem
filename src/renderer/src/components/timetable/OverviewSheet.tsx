import { Fragment, useMemo, useRef, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import type { FixedLesson, Lesson } from '@shared/types/entities'
import type { Classroom, Grade, Klass, Subject, Teacher, TimeSlot } from '@shared/types/entities'
import { buildSlotAxis } from '@renderer/pages/Timetable/timetableModel'

/**
 * 全校总表（docs/mockups/overview.html 定稿）：
 * 年级为分组表头、班级为列、星期×节次为行；
 * 40%–150% 缩放 + Ctrl+滚轮，<85% 只留学科简称（compact）、<55% 纯色块（micro）；
 * 横竖表头冻结；悬停出详情卡；行级 content-visibility 虚拟化保证 240 班滚动流畅。
 *
 * 双学段作息对不齐（锁定决策：位图一律按 stage 分桶），总表按学段分页渲染，
 * 学段切换在页面工具栏。
 */
export function OverviewSheet({
  classes,
  grades,
  lessons,
  fixed,
  slots,
  subjects,
  teachers,
  classrooms,
  hardViolations
}: {
  classes: Klass[]
  grades: Grade[]
  lessons: Lesson[]
  fixed: FixedLesson[]
  slots: TimeSlot[]
  subjects: Subject[]
  teachers: Teacher[]
  classrooms: Classroom[]
  hardViolations: number
}): React.JSX.Element {
  const [pct, setPct] = useState(100)
  const sheetRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  /** 只存命中格（变了才 setState）；位置由 mousemove 直接改 DOM，避免整表重渲染 */
  const [tip, setTip] = useState<{ ci: number; si: number } | null>(null)

  const model = useMemo(
    () =>
      buildOverviewModel(classes, grades, lessons, fixed, slots, subjects, teachers, classrooms),
    [classes, grades, lessons, fixed, slots, subjects, teachers, classrooms]
  )

  const zoom = (v: number) => setPct(Math.max(40, Math.min(150, Math.round(v / 5) * 5)))
  const fit = () => {
    const w = sheetRef.current?.clientWidth ?? 0
    if (w > 0 && model.columns.length > 0) zoom(((w - 74 - 14) / model.columns.length / 58) * 100)
  }

  const cw = Math.round((58 * pct) / 100)
  const ch = Math.round((30 * pct) / 100)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 工具栏：缩放 + 适应宽度 + 导出（M7） */}
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <Button minor onClick={() => zoom(pct - 10)}>
            −
          </Button>
          <input
            type="range"
            min={40}
            max={150}
            step={5}
            value={pct}
            onChange={(e) => zoom(+e.target.value)}
            className="h-1 w-36 cursor-pointer accent-[#4f46e5]"
            aria-label="缩放"
          />
          <span className="w-10 text-right text-xs tabular-nums text-[color:var(--text-2)]">
            {pct}%
          </span>
          <Button minor onClick={() => zoom(pct + 10)}>
            +
          </Button>
        </div>
        <Button onClick={fit}>⤢ 适应宽度</Button>
        <Button disabled title="M7 导出">
          ↥ 导出
        </Button>
      </div>

      {/* 统计条 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--panel)] px-4 py-2.5">
        <Stat k="班级" v={model.columns.length} u="个" />
        <Stat k="课时" v={model.stats.lessonCount.toLocaleString()} u="节" />
        <Stat k="教师" v={model.stats.teacherCount} u="人" />
        <Stat k="硬性冲突" v={hardViolations} u="处" tone={hardViolations === 0 ? 'ok' : 'bad'} />
        <Stat
          k="空位"
          v={model.stats.emptyCount}
          u="处"
          tone={model.stats.emptyCount === 0 ? 'ok' : 'warn'}
        />
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          {model.legend.map((s) => (
            <span
              key={s.id}
              className="flex items-center gap-1 text-[11px] text-[color:var(--text-2)]"
            >
              <i className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      </div>

      {/* 总表本体 */}
      <div
        ref={sheetRef}
        className={cn(
          'ov-sheet min-h-0 flex-1 overflow-auto rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--panel)] p-3',
          pct < 85 && 'ov-compact',
          pct < 55 && 'ov-micro'
        )}
        style={{ ['--cw' as string]: `${cw}px`, ['--ch' as string]: `${ch}px` }}
        onWheel={(e) => {
          if (!e.ctrlKey) return
          e.preventDefault()
          zoom(pct + (e.deltaY < 0 ? 5 : -5))
        }}
        onMouseOver={(e) => {
          const td = (e.target as HTMLElement).closest('td[data-ci]')
          if (td instanceof HTMLElement && td.dataset.ci != null) {
            const ci = +td.dataset.ci
            const si = +td.dataset.si!
            setTip((t) => (t && t.ci === ci && t.si === si ? t : { ci, si }))
          } else {
            setTip((t) => (t == null ? t : null))
          }
        }}
        onMouseMove={(e) => {
          const el = tipRef.current
          if (el) {
            el.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 190)}px`
            el.style.top = `${Math.min(e.clientY + 14, window.innerHeight - 170)}px`
          }
        }}
        onMouseLeave={() => setTip(null)}
      >
        <table className="ov tt-fall">
          <thead>
            <tr>
              <th className="ov-corner" />
              <th className="ov-corner2" />
              {model.gradeGroups.map((g) => (
                <th key={g.grade.id} className="gh" colSpan={g.classes.length}>
                  {g.grade.name} · {g.classes.length}个班
                </th>
              ))}
            </tr>
            <tr>
              <th className="ov-corner" />
              <th className="ov-corner2" />
              {model.columns.map((c, i) => (
                <th key={c.id} className={cn('ch', (i + 1) % 20 === 0 && 'gend')}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.dayBlocks.map((b) => (
              <Fragment key={b.day}>
                {b.rows.map((r, ri) =>
                  r.divider ? (
                    <tr key={`d${b.day}-${ri}`} className="ovr">
                      <td className="dh" style={{ borderRight: 'none' }} />
                      <td className="ph" style={{ color: 'var(--text-3)' }}>
                        {r.mark}
                      </td>
                      <td colSpan={model.columns.length} style={{ background: 'var(--panel-2)' }} />
                    </tr>
                  ) : (
                    <tr key={r.slotId} className="ovr">
                      {ri === 0 && (
                        <td className="dh" rowSpan={b.rowSpan}>
                          {DAY_NAMES[b.day]}
                        </td>
                      )}
                      <td className="ph">{r.shortLabel}</td>
                      {model.columns.map((c, ci) => {
                        const cell = model.byClass.get(c.id)?.get(r.slotId)
                        if (!cell) {
                          return (
                            <td
                              key={c.id}
                              data-ci={ci}
                              data-si={r.slotId}
                              className={cn('c ov-empty', (ci + 1) % 20 === 0 && 'gend')}
                            >
                              <span>—</span>
                            </td>
                          )
                        }
                        return (
                          <td
                            key={c.id}
                            data-ci={ci}
                            data-si={r.slotId}
                            className={cn(
                              'c',
                              (ci + 1) % 20 === 0 && 'gend',
                              !cell.color && 'ov-empty'
                            )}
                            style={cell.color ? { ['--s-ac' as string]: cell.color } : undefined}
                          >
                            {cell.short}
                            {cell.teacher && <span className="t">{cell.teacher}</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* 悬停详情卡：常驻挂载，位置由 mousemove 命令式更新 */}
      <div ref={tipRef} className={cn('ov-tip', tip && 'show')}>
        {tip && <OverviewTip tip={tip} model={model} />}
      </div>
    </div>
  )
}

function Button({
  children,
  onClick,
  disabled,
  minor,
  title
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  minor?: boolean
  title?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'rounded-btn border px-2.5 py-1 text-xs transition-colors duration-150',
        disabled
          ? 'cursor-not-allowed border-[color:var(--border-subtle)] text-[color:var(--text-3)] opacity-60'
          : minor
            ? 'border-[color:var(--border-subtle)] text-[color:var(--text-2)] hover:bg-[color:var(--panel-2)]'
            : 'border-[color:var(--border-subtle)] text-[color:var(--text-2)] hover:border-slate-300 hover:text-[color:var(--text)]'
      )}
    >
      {children}
    </button>
  )
}

function Stat({
  k,
  v,
  u,
  tone
}: {
  k: string
  v: React.ReactNode
  u: string
  tone?: 'ok' | 'warn' | 'bad'
}): React.JSX.Element {
  return (
    <span className="flex items-baseline gap-1.5 text-sm">
      <span className="text-xs text-[color:var(--text-2)]">{k}</span>
      <b
        className={cn(
          'text-[15px] font-semibold tabular-nums',
          tone === 'ok' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
          tone === 'bad' && 'text-red-600 dark:text-red-400'
        )}
      >
        {v}
      </b>
      <span className="text-[11px] text-[color:var(--text-3)]">{u}</span>
    </span>
  )
}

function OverviewTip({
  tip,
  model
}: {
  tip: { ci: number; si: number }
  model: OverviewModel
}): React.JSX.Element {
  const c = model.columns[tip.ci]
  const cell = model.byClass.get(c.id)?.get(tip.si)
  const row = model.slotById.get(tip.si)
  return (
    <>
      {cell ? (
        <>
          <div className="th">
            <i className="h-2.5 w-2.5 rounded-sm" style={{ background: cell.color ?? '#94a3b8' }} />
            {cell.name}
          </div>
          <div className="r">
            <span>班级</span>
            <b>{c.name}</b>
          </div>
          <div className="r">
            <span>时间</span>
            <b>
              {DAY_NAMES[row?.day ?? 0]} {row?.periodName}
            </b>
          </div>
          <div className="r">
            <span>教师</span>
            <b>{cell.teacherFull ?? '—'}</b>
          </div>
          <div className="r">
            <span>地点</span>
            <b>{cell.room ?? '—'}</b>
          </div>
        </>
      ) : (
        <>
          <div className="th">{c.name}</div>
          <div className="r">
            <span>
              {DAY_NAMES[row?.day ?? 0]} {row?.periodName}
            </span>
            <b>空位</b>
          </div>
        </>
      )}
    </>
  )
}

/* ================= 数据模型 ================= */

interface OvCell {
  name: string
  short: string
  color: string | null
  teacher: string | null
  teacherFull: string | null
  room: string | null
}

interface OverviewModel {
  columns: Klass[]
  gradeGroups: { grade: Grade; classes: Klass[] }[]
  dayBlocks: {
    day: number
    rowSpan: number
    rows: (
      { divider: true; mark: string } | { divider: false; slotId: number; shortLabel: string }
    )[]
  }[]
  byClass: Map<number, Map<number, OvCell>>
  slotById: Map<number, { day: number; periodName: string }>
  legend: { id: number; name: string; color: string }[]
  stats: { lessonCount: number; teacherCount: number; emptyCount: number }
}

const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

function buildOverviewModel(
  classes: Klass[],
  grades: Grade[],
  lessons: Lesson[],
  fixed: FixedLesson[],
  slots: TimeSlot[],
  subjects: Subject[],
  teachers: Teacher[],
  classrooms: Classroom[]
): OverviewModel {
  const axis = buildSlotAxis(slots)
  const gradeById = new Map(grades.map((g) => [g.id, g]))
  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const teacherById = new Map(teachers.map((t) => [t.id, t]))
  const roomById = new Map(classrooms.map((r) => [r.id, r]))
  const gradeOfClass = new Map(classes.map((c) => [c.id, gradeById.get(c.gradeId)]))

  const columns = [...classes].sort((a, b) => {
    const ga = gradeById.get(a.gradeId)?.sortOrder ?? 0
    const gb = gradeById.get(b.gradeId)?.sortOrder ?? 0
    return ga - gb || a.sortOrder - b.sortOrder || a.id - b.id
  })
  const gradeGroups = [...new Set(columns.map((c) => c.gradeId))].map((gid) => ({
    grade: gradeById.get(gid)!,
    classes: columns.filter((c) => c.gradeId === gid)
  }))

  // lesson 行按班级分桶
  const lessonByClass = new Map<number, Lesson[]>()
  for (const l of lessons) {
    const arr = lessonByClass.get(l.classId)
    if (arr) arr.push(l)
    else lessonByClass.set(l.classId, [l])
  }
  const lockedKeys = new Set(
    lessons.filter((l) => l.isLocked).map((l) => `${l.classId}:${l.classroomId}:${l.slotId}`)
  )

  const toCell = (
    subjectId: number | null,
    teacherId: number | null,
    roomId: number | null,
    label: string | null
  ): OvCell => {
    const s = subjectId != null ? subjectById.get(subjectId) : undefined
    const t = teacherId != null ? teacherById.get(teacherId) : undefined
    const r = roomId != null ? roomById.get(roomId) : undefined
    return {
      name: s?.name ?? label ?? '预排',
      short: s?.shortName ?? (label ? label.slice(0, 2) : '占'),
      color: s?.color ?? null,
      teacher: t ? t.name.slice(0, 3) : null,
      teacherFull: t?.name ?? null,
      room: r?.name ?? null
    }
  }

  const byClass = new Map<number, Map<number, OvCell>>()
  for (const c of columns) {
    const m = new Map<number, OvCell>()
    for (const l of lessonByClass.get(c.id) ?? []) {
      m.set(l.slotId, toCell(l.subjectId, l.teacherId, l.classroomId, l.remark))
    }
    // 年级 / 班级级预排叠加（升旗、早读、晚自习、班会……）
    for (const f of fixed) {
      if (f.kind !== 'lesson') continue
      if (f.classId !== c.id && !(f.classId == null && f.gradeId === gradeOfClass.get(c.id)?.id))
        continue
      if (!axis.rows.some((r) => r.slotId === f.slotId)) continue
      if (lockedKeys.has(`${c.id}:${f.classroomId}:${f.slotId}`)) continue
      if (!m.has(f.slotId))
        m.set(f.slotId, toCell(f.subjectId, f.teacherId, f.classroomId, f.label))
    }
    byClass.set(c.id, m)
  }

  // 行轴按天分块：段切换处内联插分隔行（午 / 晚）
  const dayBlocks: OverviewModel['dayBlocks'] = []
  const slotById = new Map<number, { day: number; periodName: string }>()
  const SEG_MARK: Record<string, string> = { 'morning→afternoon': '午', 'afternoon→evening': '晚' }
  for (const d of axis.days) {
    const rows: OverviewModel['dayBlocks'][number]['rows'] = []
    let prevSeg: string | null = null
    for (const r of axis.rows) {
      if (r.day !== d) continue
      slotById.set(r.slotId, { day: r.day, periodName: r.periodName })
      if (prevSeg != null && r.segment !== prevSeg && SEG_MARK[`${prevSeg}→${r.segment}`]) {
        rows.push({ divider: true, mark: SEG_MARK[`${prevSeg}→${r.segment}`] })
      }
      rows.push({
        divider: false,
        slotId: r.slotId,
        shortLabel: r.periodName.replace('第', '').replace('节', '')
      })
      prevSeg = r.segment
    }
    dayBlocks.push({ day: d, rowSpan: rows.length, rows })
  }

  // 统计 + 图例
  const stageClassIds = new Set(columns.map((c) => c.id))
  const stageLessons = lessons.filter((l) => stageClassIds.has(l.classId))
  const legendIds = new Map<number, Subject>()
  for (const l of stageLessons) {
    const s = subjectById.get(l.subjectId)
    if (s) legendIds.set(s.id, s)
  }
  let emptyCount = 0
  for (const c of columns) {
    const m = byClass.get(c.id)!
    for (const r of axis.rows) if (!m.has(r.slotId)) emptyCount++
  }

  return {
    columns,
    gradeGroups,
    dayBlocks,
    byClass,
    slotById,
    legend: [...legendIds.values()]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ id: s.id, name: s.name, color: s.color })),
    stats: {
      lessonCount: stageLessons.length,
      teacherCount: new Set(stageLessons.map((l) => l.teacherId).filter((t) => t != null)).size,
      emptyCount
    }
  }
}
