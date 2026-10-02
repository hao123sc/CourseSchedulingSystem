import type {
  Classroom,
  FixedLesson,
  Grade,
  Klass,
  Lesson,
  Subject,
  Teacher,
  TimeSlot
} from './types/entities'
import type { TimetableLayoutOptions } from './types/ipc'

export type ExportViewType = 'class' | 'teacher' | 'room' | 'overview'

export interface ExportMetaContext {
  schoolName?: string
  semesterName?: string
  versionName?: string
  stageName?: string
  subjects: Subject[]
  teachers: Teacher[]
  classrooms: Classroom[]
  classes: Klass[]
  grades: Grade[]
}

export interface FormattedCellItem {
  subjectId: number | null
  subjectName: string
  shortName: string
  teacherId?: number | null
  teacherName?: string
  classId?: number | null
  className?: string
  classroomId?: number | null
  roomName?: string
  label?: string | null
  isLocked: boolean
  isOverlay: boolean
  isConsecutive: boolean
  color?: string | null
  fullText: string
}

export interface ExportGridCell {
  slotId: number
  day: number
  periodIndex: number
  periodName: string
  items: FormattedCellItem[]
  formattedText: string
}

export interface ExportPeriodRow {
  periodIndex: number
  periodName: string
  timeRange: string
  segment: string
  dividerBefore?: string | null
  cellsByDay: Map<number, ExportGridCell>
}

export interface SingleTimetableExportSheet {
  sheetName: string
  title: string
  subTitle: string
  viewType: 'class' | 'teacher' | 'room'
  targetId: number
  targetName: string
  days: number[]
  dayNames: Record<number, string>
  rows: ExportPeriodRow[]
  layoutOptions?: TimetableLayoutOptions
  stats: {
    totalLessons: number
    lockedLessons: number
    overlayItems: number
    consecutiveCount: number
  }
}

export interface OverviewExportRow {
  day: number
  dayName: string
  periodIndex: number
  periodName: string
  timeRange: string
  segment: string
  dividerBefore?: string | null
  cellsByClassId: Map<
    number,
    {
      text: string
      subjectName?: string
      teacherName?: string
      roomName?: string
      isLocked?: boolean
      isOverlay?: boolean
      color?: string | null
    }
  >
}

export interface OverviewExportSheet {
  sheetName: string
  title: string
  subTitle: string
  stageName: string
  days: number[]
  dayNames: Record<number, string>
  classes: { id: number; name: string; gradeId: number; gradeName: string }[]
  grades: { id: number; name: string; classCount: number }[]
  rows: OverviewExportRow[]
  layoutOptions?: TimetableLayoutOptions
  stats: {
    classCount: number
    lessonCount: number
    teacherCount: number
    emptyCount: number
  }
}

export const DAY_ZH_NAMES: Record<number, string> = {
  1: '星期一',
  2: '星期二',
  3: '星期三',
  4: '星期四',
  5: '星期五',
  6: '星期六',
  7: '星期日'
}

export const SEG_DIVIDER_LABEL: Record<string, string> = {
  'morning→afternoon': '午休',
  'afternoon→evening': '晚间'
}

/** Excel 工作表名称清洗：限制最长 31 字符，且不能包含 \ / ? * [ ] : */
export function sanitizeSheetName(name: string, fallback = 'Sheet'): string {
  if (!name) return fallback
  const cleaned = name.replace(/[\\/?*[\]:]/g, '_').trim()
  return (cleaned.slice(0, 31) || fallback).trim()
}

/** 格式化单节课单元的文本表达 */
export function formatCellItem(
  view: 'class' | 'teacher' | 'room',
  item: {
    subjectName: string
    teacherName?: string
    className?: string
    roomName?: string
    label?: string | null
    isLocked: boolean
    isOverlay: boolean
  }
): string {
  const { subjectName, teacherName, className, roomName, label, isLocked, isOverlay } = item

  if (view === 'class') {
    if (isOverlay && !teacherName && !roomName && label) {
      return label
    }
    const metaParts = [teacherName, roomName].filter(Boolean)
    const meta = metaParts.length > 0 ? metaParts.join(' · ') : ''
    const lockTag = isLocked ? ' [预排]' : ''
    const mainTitle = (subjectName || label || '课程') + lockTag
    return meta ? `${mainTitle}\n${meta}` : mainTitle
  }

  if (view === 'teacher') {
    if (isOverlay && !className && !roomName && label) {
      return label
    }
    const meta = [className, roomName].filter(Boolean).join(' · ')
    const lockTag = isLocked && !isOverlay ? ' [预排]' : ''
    const mainTitle = (subjectName || label || '课程') + lockTag
    return meta ? `${mainTitle}\n${meta}` : mainTitle
  }

  // room view
  if (isOverlay && !className && !teacherName && label) {
    return `${label} (占用)`
  }
  const prefix = className ? `${className} · ` : ''
  const t = teacherName ? ` (${teacherName})` : ''
  const lockTag = isLocked ? ' [预排]' : ''
  return `${prefix}${subjectName || label || '课程'}${t}${lockTag}`
}

/** 组装单个实体（班级 / 教师 / 教室）的课表导出模型（纯函数） */
export function buildSingleTimetableExportSheet(params: {
  view: 'class' | 'teacher' | 'room'
  targetId: number
  slots: TimeSlot[]
  lessons: Lesson[]
  fixedLessons: FixedLesson[]
  meta: ExportMetaContext
  layoutOptions?: TimetableLayoutOptions
}): SingleTimetableExportSheet {
  const { view, targetId, slots, lessons, fixedLessons, meta, layoutOptions } = params

  const subjectById = new Map(meta.subjects.map((s) => [s.id, s]))
  const teacherById = new Map(meta.teachers.map((t) => [t.id, t]))
  const roomById = new Map(meta.classrooms.map((r) => [r.id, r]))
  const classById = new Map(meta.classes.map((c) => [c.id, c]))
  const gradeById = new Map(meta.grades.map((g) => [g.id, g]))
  const gradeOfClass = new Map(meta.classes.map((c) => [c.id, c.gradeId]))

  const targetClass = view === 'class' ? classById.get(targetId) : undefined
  const targetTeacher = view === 'teacher' ? teacherById.get(targetId) : undefined
  const targetRoom = view === 'room' ? roomById.get(targetId) : undefined

  let targetName = '课表'
  if (view === 'class') targetName = targetClass?.name ?? `班级#${targetId}`
  else if (view === 'teacher') targetName = targetTeacher?.name ?? `教师#${targetId}`
  else if (view === 'room') targetName = targetRoom?.name ?? `教室#${targetId}`

  const teachingSlots = slots
    .filter((s) => s.isTeaching)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.sortOrder - b.sortOrder || a.periodIndex - b.periodIndex)

  const days = [...new Set(teachingSlots.map((s) => s.dayOfWeek))].sort((a, b) => a - b)
  const slotByDayAndPeriod = new Map<string, TimeSlot>()
  for (const s of teachingSlots) {
    slotByDayAndPeriod.set(`${s.dayOfWeek}:${s.periodIndex}`, s)
  }

  // 1. 已物化的预排判重（班:师:室:槽 四元组）
  const lockedTuples = new Set(
    lessons
      .filter((l) => l.isLocked)
      .map((l) => `${l.classId}:${l.teacherId}:${l.classroomId}:${l.slotId}`)
  )

  const classesOfGrade = new Map<number, number[]>()
  for (const c of meta.classes) {
    const gid = gradeOfClass.get(c.id)
    if (gid == null) continue
    const arr = classesOfGrade.get(gid)
    if (arr) arr.push(c.id)
    else classesOfGrade.set(gid, [c.id])
  }

  const isMaterialized = (f: FixedLesson): boolean => {
    if (f.kind !== 'lesson') return false
    const targets = f.classId != null ? [f.classId] : (classesOfGrade.get(f.gradeId ?? -1) ?? [])
    return targets.some((c) => lockedTuples.has(`${c}:${f.teacherId}:${f.classroomId}:${f.slotId}`))
  }

  // 2. 筛选属于当前目标的 lesson 行
  const targetLessons = lessons.filter((l) => {
    if (view === 'class') return l.classId === targetId
    if (view === 'teacher') return l.teacherId === targetId
    return l.classroomId === targetId
  })

  // 3. 筛选属于当前目标的 fixed_lesson 行（排除已物化）
  const targetFixed = fixedLessons.filter((f) => {
    if (isMaterialized(f)) return false
    if (view === 'class') {
      return (
        f.kind === 'lesson' &&
        (f.classId === targetId || (f.classId == null && f.gradeId === gradeOfClass.get(targetId)))
      )
    }
    if (view === 'teacher') return f.teacherId === targetId
    return f.classroomId === targetId
  })

  // 4. 按 slotId 分桶
  const itemsBySlot = new Map<number, FormattedCellItem[]>()
  let lockedCount = 0
  let overlayCount = 0
  let consecutiveCount = 0

  for (const l of targetLessons) {
    const subject = subjectById.get(l.subjectId)
    const t = l.teacherId != null ? teacherById.get(l.teacherId) : undefined
    const r = l.classroomId != null ? roomById.get(l.classroomId) : undefined
    const c = classById.get(l.classId)
    const isConsecutive = Boolean(l.consecutiveGroup)
    if (l.isLocked) lockedCount++
    if (isConsecutive) consecutiveCount++

    const item: FormattedCellItem = {
      subjectId: l.subjectId,
      subjectName: subject?.name ?? '课程',
      shortName: subject?.shortName ?? '课',
      teacherId: l.teacherId,
      teacherName: t?.name,
      classId: l.classId,
      className: c?.name,
      classroomId: l.classroomId,
      roomName: r?.name,
      label: l.remark,
      isLocked: l.isLocked,
      isOverlay: false,
      isConsecutive,
      color: subject?.color ?? null,
      fullText: ''
    }
    item.fullText = formatCellItem(view, item)

    const list = itemsBySlot.get(l.slotId) ?? []
    list.push(item)
    itemsBySlot.set(l.slotId, list)
  }

  for (const f of targetFixed) {
    overlayCount++
    const subject = f.subjectId != null ? subjectById.get(f.subjectId) : undefined
    const t = f.teacherId != null ? teacherById.get(f.teacherId) : undefined
    const r = f.classroomId != null ? roomById.get(f.classroomId) : undefined
    const c = f.classId != null ? classById.get(f.classId) : undefined

    const item: FormattedCellItem = {
      subjectId: f.subjectId ?? null,
      subjectName: subject?.name ?? f.label ?? '预排占位',
      shortName: subject?.shortName ?? (f.label ? f.label.slice(0, 2) : '占'),
      teacherId: f.teacherId,
      teacherName: t?.name,
      classId: f.classId,
      className: c?.name,
      classroomId: f.classroomId,
      roomName: r?.name,
      label: f.label,
      isLocked: true,
      isOverlay: true,
      isConsecutive: false,
      color: subject?.color ?? null,
      fullText: ''
    }
    item.fullText = formatCellItem(view, item)

    const list = itemsBySlot.get(f.slotId) ?? []
    list.push(item)
    itemsBySlot.set(f.slotId, list)
  }

  // 5. 按照时段与节次构建行与单元格
  const periodIndexes = [...new Set(teachingSlots.map((s) => s.periodIndex))].sort((a, b) => a - b)
  const rows: ExportPeriodRow[] = []

  let prevSegment: string | null = null
  let prevEndTime: string | null = null

  for (const pIdx of periodIndexes) {
    const periodSlots = teachingSlots.filter((s) => s.periodIndex === pIdx)
    const refSlot = periodSlots[0]
    if (!refSlot) continue

    const periodName = refSlot.periodName || `第${pIdx}节`
    const timeRange = refSlot.startTime && refSlot.endTime ? `${refSlot.startTime} - ${refSlot.endTime}` : ''
    const segment = refSlot.segment

    let dividerBefore: string | null = null
    if (prevSegment != null && segment !== prevSegment) {
      const segKey = `${prevSegment}→${segment}`
      const baseLabel = SEG_DIVIDER_LABEL[segKey] || '休息'
      const range = prevEndTime && refSlot.startTime ? ` (${prevEndTime} - ${refSlot.startTime})` : ''
      dividerBefore = `—— ${baseLabel}${range} ——`
    }

    const cellsByDay = new Map<number, ExportGridCell>()
    for (const d of days) {
      const slot = slotByDayAndPeriod.get(`${d}:${pIdx}`)
      if (!slot) continue
      const items = itemsBySlot.get(slot.id) ?? []
      const formattedText = items.map((it) => it.fullText).join('\n\n')
      cellsByDay.set(d, {
        slotId: slot.id,
        day: d,
        periodIndex: pIdx,
        periodName,
        items,
        formattedText
      })
    }

    rows.push({
      periodIndex: pIdx,
      periodName,
      timeRange,
      segment,
      dividerBefore,
      cellsByDay
    })

    prevSegment = segment
    prevEndTime = refSlot.endTime
  }

  // 6. 标题与副标题
  const schoolTitle = meta.schoolName ? `【${meta.schoolName}】` : ''
  const semesterTitle = meta.semesterName ? `${meta.semesterName} ` : ''
  const title = `${schoolTitle}${semesterTitle}${targetName} 课程表`

  const subParts: string[] = []
  if (meta.versionName) subParts.push(`版本：${meta.versionName}`)
  if (view === 'class' && targetClass?.headTeacherId) {
    const ht = teacherById.get(targetClass.headTeacherId)
    if (ht) subParts.push(`班主任：${ht.name}`)
  }
  if (view === 'class' && targetClass?.gradeId) {
    const gr = gradeById.get(targetClass.gradeId)
    if (gr) subParts.push(`年级：${gr.name}`)
  }
  if (meta.stageName) subParts.push(`学段：${meta.stageName}`)
  const subTitle = subParts.join('  |  ')

  return {
    sheetName: sanitizeSheetName(targetName, '课表'),
    title: layoutOptions?.customHeader ? layoutOptions.customHeader : title,
    subTitle,
    viewType: view,
    targetId,
    targetName,
    days,
    dayNames: DAY_ZH_NAMES,
    rows,
    layoutOptions,
    stats: {
      totalLessons: targetLessons.length,
      lockedLessons: lockedCount,
      overlayItems: overlayCount,
      consecutiveCount
    }
  }
}

/** 组装全校 / 学段总表导出模型（纯函数） */
export function buildOverviewExportSheet(params: {
  slots: TimeSlot[]
  stageClasses: Klass[]
  grades: Grade[]
  lessons: Lesson[]
  fixedLessons: FixedLesson[]
  meta: ExportMetaContext
  layoutOptions?: TimetableLayoutOptions
}): OverviewExportSheet {
  const { slots, stageClasses, grades, lessons, fixedLessons, meta, layoutOptions } = params

  const subjectById = new Map(meta.subjects.map((s) => [s.id, s]))
  const teacherById = new Map(meta.teachers.map((t) => [t.id, t]))
  const roomById = new Map(meta.classrooms.map((r) => [r.id, r]))
  const gradeById = new Map(grades.map((g) => [g.id, g]))
  const gradeOfClass = new Map(stageClasses.map((c) => [c.id, c.gradeId]))

  const sortedClasses = [...stageClasses].sort((a, b) => {
    const ga = gradeById.get(a.gradeId)?.sortOrder ?? 0
    const gb = gradeById.get(b.gradeId)?.sortOrder ?? 0
    return ga - gb || a.sortOrder - b.sortOrder || a.id - b.id
  })

  const classList = sortedClasses.map((c) => ({
    id: c.id,
    name: c.name,
    gradeId: c.gradeId,
    gradeName: gradeById.get(c.gradeId)?.name ?? '未知年级'
  }))

  const gradeGroupIds = [...new Set(sortedClasses.map((c) => c.gradeId))]
  const gradeSummary = gradeGroupIds.map((gid) => ({
    id: gid,
    name: gradeById.get(gid)?.name ?? '未知年级',
    classCount: sortedClasses.filter((c) => c.gradeId === gid).length
  }))

  const teachingSlots = slots
    .filter((s) => s.isTeaching)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.sortOrder - b.sortOrder || a.periodIndex - b.periodIndex)

  const days = [...new Set(teachingSlots.map((s) => s.dayOfWeek))].sort((a, b) => a - b)

  // 1. 班级 lesson 分桶
  const lessonByClassAndSlot = new Map<string, Lesson>()
  for (const l of lessons) {
    lessonByClassAndSlot.set(`${l.classId}:${l.slotId}`, l)
  }

  // 2. 物化判重 key
  const lockedKeys = new Set(
    lessons.filter((l) => l.isLocked).map((l) => `${l.classId}:${l.classroomId}:${l.slotId}`)
  )

  // 3. 构建行轴（按天 + 节次）
  const rows: OverviewExportRow[] = []
  let prevSeg: string | null = null
  let prevEndTime: string | null = null
  let totalLessonsPlaced = 0
  let emptyCount = 0
  const activeTeacherIds = new Set<number>()

  for (const d of days) {
    const daySlots = teachingSlots.filter((s) => s.dayOfWeek === d)
    for (const slot of daySlots) {
      let dividerBefore: string | null = null
      if (prevSeg != null && slot.segment !== prevSeg) {
        const segKey = `${prevSeg}→${slot.segment}`
        const baseLabel = SEG_DIVIDER_LABEL[segKey] || '休息'
        const range = prevEndTime && slot.startTime ? ` (${prevEndTime} - ${slot.startTime})` : ''
        dividerBefore = `—— ${baseLabel}${range} ——`
      }

      const cellsByClassId = new Map<
        number,
        {
          text: string
          subjectName?: string
          teacherName?: string
          roomName?: string
          isLocked?: boolean
          isOverlay?: boolean
          color?: string | null
        }
      >()

      for (const cls of sortedClasses) {
        const l = lessonByClassAndSlot.get(`${cls.id}:${slot.id}`)
        if (l) {
          totalLessonsPlaced++
          if (l.teacherId != null) activeTeacherIds.add(l.teacherId)
          const subj = subjectById.get(l.subjectId)
          const tch = l.teacherId != null ? teacherById.get(l.teacherId) : undefined
          const rm = l.classroomId != null ? roomById.get(l.classroomId) : undefined
          const subText = tch?.name ? ` (${tch.name})` : ''
          cellsByClassId.set(cls.id, {
            text: `${subj?.name ?? '课程'}${subText}`,
            subjectName: subj?.name ?? '课程',
            teacherName: tch?.name,
            roomName: rm?.name,
            isLocked: l.isLocked,
            isOverlay: false,
            color: subj?.color ?? null
          })
          continue
        }

        // 检查 fixed_lesson 叠加
        const fixed = fixedLessons.find((f) => {
          if (f.slotId !== slot.id || f.kind !== 'lesson') return false
          if (f.classId !== cls.id && !(f.classId == null && f.gradeId === gradeOfClass.get(cls.id))) return false
          if (lockedKeys.has(`${cls.id}:${f.classroomId}:${f.slotId}`)) return false
          return true
        })

        if (fixed) {
          totalLessonsPlaced++
          if (fixed.teacherId != null) activeTeacherIds.add(fixed.teacherId)
          const subj = fixed.subjectId != null ? subjectById.get(fixed.subjectId) : undefined
          const tch = fixed.teacherId != null ? teacherById.get(fixed.teacherId) : undefined
          const rm = fixed.classroomId != null ? roomById.get(fixed.classroomId) : undefined
          const name = subj?.name ?? fixed.label ?? '预排占位'
          const subText = tch?.name ? ` (${tch.name})` : ''
          cellsByClassId.set(cls.id, {
            text: `${name}${subText}`,
            subjectName: name,
            teacherName: tch?.name,
            roomName: rm?.name,
            isLocked: true,
            isOverlay: true,
            color: subj?.color ?? null
          })
        } else {
          emptyCount++
          cellsByClassId.set(cls.id, {
            text: '',
            isLocked: false,
            isOverlay: false,
            color: null
          })
        }
      }

      rows.push({
        day: d,
        dayName: DAY_ZH_NAMES[d] ?? `周${d}`,
        periodIndex: slot.periodIndex,
        periodName: slot.periodName || `第${slot.periodIndex}节`,
        timeRange: slot.startTime && slot.endTime ? `${slot.startTime} - ${slot.endTime}` : '',
        segment: slot.segment,
        dividerBefore,
        cellsByClassId
      })

      prevSeg = slot.segment
      prevEndTime = slot.endTime
    }
  }

  const schoolTitle = meta.schoolName ? `【${meta.schoolName}】` : ''
  const semesterTitle = meta.semesterName ? `${meta.semesterName} ` : ''
  const stageTitle = meta.stageName ? `${meta.stageName} ` : ''
  const title = `${schoolTitle}${semesterTitle}${stageTitle}全校总课表`

  const subParts: string[] = []
  if (meta.versionName) subParts.push(`版本：${meta.versionName}`)
  subParts.push(`班级总数：${sortedClasses.length} 个班`)
  const subTitle = subParts.join('  |  ')

  return {
    sheetName: sanitizeSheetName(meta.stageName ? `${meta.stageName}总表` : '全校总表', '总课表'),
    title: layoutOptions?.customHeader ? layoutOptions.customHeader : title,
    subTitle,
    stageName: meta.stageName ?? '全校',
    days,
    dayNames: DAY_ZH_NAMES,
    classes: classList,
    grades: gradeSummary,
    rows,
    layoutOptions,
    stats: {
      classCount: sortedClasses.length,
      lessonCount: totalLessonsPlaced,
      teacherCount: activeTeacherIds.size,
      emptyCount
    }
  }
}
