import type { FixedLesson, Lesson } from '@shared/types/entities'
import type { Classroom, Klass, Subject, Teacher, TimeSlot } from '@shared/types/entities'

/**
 * 课表页的数据组装（纯函数，渲染层）：
 * lesson 行（版本快照）+ fixed_lesson 叠加（升旗/早读/晚自习/班会等不产生 lesson 行的
 * 预排）→ 按视图（班级/教师/教室）抽出一张「周网格」。
 *
 * 纪律：冲突判定逻辑在 @shared/constraints 只有唯一一份，这里**不做冲突判定**，
 * 只做展示投影（谁在哪格、什么颜色、跨不跨行）。
 */

export type TTView = 'class' | 'teacher' | 'room' | 'overview'

export interface SlotRow {
  slotId: number
  day: number
  periodIndex: number
  periodName: string
  times: string
  segment: string
}

export interface SlotAxis {
  days: number[]
  rows: SlotRow[]
  /** slotId → 前面要插一条段分隔（午休 / 晚间），值为分隔条文案 */
  dividerBefore: Map<number, string>
}

/** 一格课表块（lesson 行或预排叠加） */
export interface GridLesson {
  key: string
  slotId: number
  subjectId: number | null
  subjectName: string
  shortName: string
  color: string | null
  /** 副标题：班级视图 = 教师 · 教室；教师/教室视图 = 班级 · 对方 */
  meta: string
  locked: boolean
  weekMode: 'all' | 'odd' | 'even'
  /** 连堂：组内节序与总节数（1 = 单节） */
  blockIndex: number
  blockSize: number
  /** 预排叠加（无 lesson 行）：升旗/早读/晚自习/班会/教室维护 */
  overlay: boolean
  label: string | null
  title: string
}

export interface ClassGrid {
  lessonsBySlot: Map<number, GridLesson[]>
  /** 被「上方连堂块跨行覆盖」的 slotId 集合（这些格不再渲染内容） */
  covered: Set<number>
}

/** 把学段作息摊平成行轴；段与段之间（午休/晚间）插分隔条 */
export function buildSlotAxis(slots: TimeSlot[]): SlotAxis {
  const teaching = slots.filter((s) => s.isTeaching)
  const days = [...new Set(teaching.map((s) => s.dayOfWeek))].sort((a, b) => a - b)
  const rows: SlotRow[] = []
  const dividerBefore = new Map<number, string>()

  const SEG_LABEL: Record<string, string> = {
    'morning→afternoon': '午休',
    'afternoon→evening': '晚间'
  }

  for (const d of days) {
    const daySlots = teaching
      .filter((s) => s.dayOfWeek === d)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.periodIndex - b.periodIndex)
    let prevSegment: string | null = null
    let prevEnd: string | null = null
    for (const s of daySlots) {
      if (prevSegment != null && s.segment !== prevSegment) {
        const label = SEG_LABEL[`${prevSegment}→${s.segment}`]
        if (label) {
          const range = prevEnd && s.startTime ? `${prevEnd} — ${s.startTime}` : ''
          dividerBefore.set(s.id, range ? `${label} ${range}` : label)
        }
      }
      rows.push({
        slotId: s.id,
        day: d,
        periodIndex: s.periodIndex,
        periodName: s.periodName,
        times: s.startTime && s.endTime ? `${s.startTime}\n${s.endTime}` : '',
        segment: s.segment
      })
      prevSegment = s.segment
      prevEnd = s.endTime
    }
  }
  return { days, rows, dividerBefore }
}

/**
 * 学科展示色：inline 只给 --s-ac（学科库 color），
 * bg / 文字 / 描边由 globals.css 的 .tt-lesson 规则用 color-mix 派生——
 * 这样深色模式能整套换派生参数，不被 inline 变量压住。
 */
export function subjectVars(color: string | null): React.CSSProperties {
  if (!color) return {}
  return { ['--s-ac' as string]: color }
}

interface Meta {
  subjects: Subject[]
  teachers: Teacher[]
  classrooms: Classroom[]
  classes: Klass[]
}

/** lesson 行 + 预排叠加 → 某个班级 / 教师 / 教室的一张周网格 */
export function buildEntityGrid(
  view: 'class' | 'teacher' | 'room',
  targetId: number,
  lessons: Lesson[],
  fixed: FixedLesson[],
  axis: SlotAxis,
  meta: Meta
): ClassGrid {
  const subjectById = new Map(meta.subjects.map((s) => [s.id, s]))
  const teacherById = new Map(meta.teachers.map((t) => [t.id, t]))
  const roomById = new Map(meta.classrooms.map((r) => [r.id, r]))
  const classById = new Map(meta.classes.map((c) => [c.id, c]))
  const gradeOfClass = new Map(meta.classes.map((c) => [c.id, c.gradeId]))

  const lessonsBySlot = new Map<number, GridLesson[]>()
  const covered = new Set<number>()

  // ── 1. 版本里的 lesson 行 ──
  const mine = lessons.filter((l) =>
    view === 'class'
      ? l.classId === targetId
      : view === 'teacher'
        ? l.teacherId === targetId
        : l.classroomId === targetId
  )

  // 连堂组：slotId → 组信息（组内第几节 / 共几节）。
  // 教室视图不做跨行：多并发场地（田径场等）同格有多节课，跨行覆盖会把并发课藏掉
  const useSpan = view !== 'room'
  const groupInfo = new Map<number, { group: string; index: number; size: number }>()
  const groups = new Map<string, { slotIds: number[] }>()
  if (useSpan) {
    for (const l of mine) {
      if (l.consecutiveGroup) {
        const g = groups.get(l.consecutiveGroup) ?? { slotIds: [] }
        g.slotIds.push(l.slotId)
        groups.set(l.consecutiveGroup, g)
      }
    }
  }
  for (const [group, { slotIds }] of groups) {
    slotIds.sort(
      (a, b) =>
        (axis.rows.find((r) => r.slotId === a)?.periodIndex ?? 0) -
        (axis.rows.find((r) => r.slotId === b)?.periodIndex ?? 0)
    )
    slotIds.forEach((sid, i) => groupInfo.set(sid, { group, index: i, size: slotIds.length }))
  }

  for (const l of mine) {
    const subject = subjectById.get(l.subjectId)
    const t = l.teacherId != null ? teacherById.get(l.teacherId) : undefined
    const r = l.classroomId != null ? roomById.get(l.classroomId) : undefined
    const c = classById.get(l.classId)
    const gi = groupInfo.get(l.slotId)
    const meta1 =
      view === 'class'
        ? `${t ? t.name + ' · ' : ''}${r ? r.name : ''}`
        : view === 'teacher'
          ? `${c ? c.name : ''}${r ? ' · ' + r.name : ''}`
          : `${c ? c.name : ''}${t ? ' · ' + t.name : ''}`
    lessonsBySlot.set(l.slotId, [
      ...(lessonsBySlot.get(l.slotId) ?? []),
      {
        key: `l${l.id}`,
        slotId: l.slotId,
        subjectId: l.subjectId,
        subjectName: subject?.name ?? '课程',
        shortName: subject?.shortName ?? '课',
        color: subject?.color ?? null,
        meta: meta1,
        locked: l.isLocked,
        weekMode: l.weekMode,
        blockIndex: gi?.index ?? 0,
        blockSize: gi?.size ?? 1,
        overlay: false,
        label: l.remark,
        title: `${subject?.name ?? '课程'}${l.isLocked ? '（预排锁定）' : ''}`
      }
    ])
  }

  // 连堂块覆盖：非首节的 slot 不再渲染（由首节块跨行盖住）
  if (useSpan) {
    for (const [, { slotIds }] of groups) {
      for (const sid of slotIds.slice(1)) covered.add(sid)
    }
  }

  // ── 2. 预排叠加（不产生 lesson 行的那部分）──
  // 班级视图：钉在本班 / 本年级的 lesson 类预排
  // 教师视图：占本教师的预排（lesson 或 block）
  // 教室视图：占本教室的预排（lesson 或 block，block 独占容量）
  const lockedKeys = new Set(
    lessons.filter((l) => l.isLocked).map((l) => `${l.classId}:${l.classroomId}:${l.slotId}`)
  )
  for (const f of fixed) {
    if (!axis.rows.some((r) => r.slotId === f.slotId)) continue
    if (view === 'class') {
      const hit =
        f.kind === 'lesson' &&
        (f.classId === targetId || (f.classId == null && f.gradeId === gradeOfClass.get(targetId)))
      if (!hit) continue
      // 已被物化成本版本的锁定课 → 不重复显示
      if (lockedKeys.has(`${targetId}:${f.classroomId ?? ''}:${f.slotId}`)) continue
    } else if (view === 'teacher') {
      if (f.teacherId !== targetId) continue
    } else {
      if (f.classroomId !== targetId) continue
      if (f.kind === 'lesson' && lockedKeys.has(`${f.classId ?? ''}:${targetId}:${f.slotId}`)) {
        continue
      }
    }

    const subject = f.subjectId != null ? subjectById.get(f.subjectId) : undefined
    const t = f.teacherId != null ? teacherById.get(f.teacherId) : undefined
    const r = f.classroomId != null ? roomById.get(f.classroomId) : undefined
    const c = f.classId != null ? classById.get(f.classId) : undefined
    const meta1 =
      view === 'class'
        ? `${t ? t.name + ' · ' : ''}${r ? r.name : ''}`
        : view === 'teacher'
          ? `${f.label ?? (subject ? subject.name : '预排占位')}${r ? ' · ' + r.name : ''}`
          : `${c ? c.name : ''}${t ? ' · ' + t.name : ''}`
    lessonsBySlot.set(f.slotId, [
      ...(lessonsBySlot.get(f.slotId) ?? []),
      {
        key: `f${f.id}`,
        slotId: f.slotId,
        subjectId: f.subjectId ?? null,
        subjectName: subject?.name ?? f.label ?? '预排占位',
        shortName: subject?.shortName ?? (f.label ? f.label.slice(0, 2) : '占'),
        color: subject?.color ?? null,
        meta: meta1,
        locked: true,
        weekMode: 'all',
        blockIndex: 0,
        blockSize: 1,
        overlay: true,
        label: f.label,
        title: `${f.label ?? subject?.name ?? '预排占位'}（预排）`
      }
    ])
  }

  return { lessonsBySlot, covered }
}

/** 教师课表的空隙：某天上第一节课与最后一节课之间空着的教学槽 */
export function teacherGapSlots(
  grid: ClassGrid,
  axis: SlotAxis
): { gaps: Set<number>; byDay: Map<number, number> } {
  const gaps = new Set<number>()
  const byDay = new Map<number, number>()
  const rowsByDay = new Map<number, SlotRow[]>()
  for (const r of axis.rows) {
    const arr = rowsByDay.get(r.day)
    if (arr) arr.push(r)
    else rowsByDay.set(r.day, [r])
  }
  for (const [, rows] of rowsByDay) {
    const occupied = rows.filter((r) => (grid.lessonsBySlot.get(r.slotId) ?? []).length > 0)
    if (occupied.length < 2) continue
    const first = rows.indexOf(occupied[0])
    const last = rows.indexOf(occupied[occupied.length - 1])
    for (let i = first; i <= last; i++) {
      if ((grid.lessonsBySlot.get(rows[i].slotId) ?? []).length === 0) {
        gaps.add(rows[i].slotId)
        byDay.set(rows[i].day, (byDay.get(rows[i].day) ?? 0) + 1)
      }
    }
  }
  return { gaps, byDay }
}
