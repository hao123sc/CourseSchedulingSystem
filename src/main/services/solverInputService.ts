import { getDb } from '../db/connection'
import type {
  SolverClass,
  SolverConstraintGroup,
  SolverFixedLesson,
  SolverGrade,
  SolverInput,
  SolverRoom,
  SolverRoomCoexistRule,
  SolverSlot,
  SolverStage,
  SolverSubject,
  SolverSubjectRoom,
  SolverTask,
  SolverTeacher,
  SolverTimeRule
} from '@solver/model/types'
import { validateSolverInput, type SolverInputReport } from '@solver/model/validate'
import type { Segment, WeekMode } from '@shared/domain'

/**
 * 从 SQLite 读全量数据，组装成引擎输入快照 `SolverInput`。
 *
 * 这是「数据层 → 引擎」的唯一桥梁（docs/02 §4 数据流）：
 * 引擎侧 `src/solver/**` 纯 TS 零 IO，所有数据库访问都收敛在这里。
 */
export function buildSolverInput(semesterId: number, weightProfileCode = 'balanced'): SolverInput {
  const db = getDb()

  const semester = db.prepare('SELECT id, name FROM semester WHERE id = ?').get(semesterId) as
    | { id: number; name: string }
    | undefined

  // ── 权重档位 ──
  const wp = db.prepare('SELECT code, payload FROM weight_profile WHERE code = ?').get(
    weightProfileCode
  ) as { code: string; payload: string } | undefined
  let weights: Record<string, number> = {}
  if (wp) {
    try {
      weights = JSON.parse(wp.payload) as Record<string, number>
    } catch {
      weights = {}
    }
  }

  // ── 时段 ──
  const slotRows = db
    .prepare(
      `SELECT id, stage_id, day_of_week, period_index, period_name, segment, is_teaching, sort_order
         FROM time_slot ORDER BY stage_id, sort_order, day_of_week, period_index`
    )
    .all() as {
    id: number
    stage_id: number
    day_of_week: number
    period_index: number
    period_name: string
    segment: string
    is_teaching: number
    sort_order: number
  }[]
  const slots: SolverSlot[] = slotRows.map((r) => ({
    id: r.id,
    stageId: r.stage_id,
    dayOfWeek: r.day_of_week,
    periodIndex: r.period_index,
    periodName: r.period_name,
    segment: r.segment as Segment,
    isTeaching: r.is_teaching === 1,
    sortOrder: r.sort_order
  }))

  // ── 学段 ──
  const stageRows = db
    .prepare(
      'SELECT id, code, name, days_per_week, has_evening FROM stage WHERE enabled = 1 ORDER BY sort_order, id'
    )
    .all() as {
    id: number
    code: string
    name: string
    days_per_week: number
    has_evening: number
  }[]
  const stages: SolverStage[] = stageRows.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    daysPerWeek: s.days_per_week,
    hasEvening: s.has_evening === 1,
    slotIds: slots
      .filter((sl) => sl.stageId === s.id && sl.isTeaching && sl.dayOfWeek <= s.days_per_week)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodIndex - b.periodIndex)
      .map((sl) => sl.id)
  }))

  // ── 年级 / 班级 ──
  const gradeRows = db
    .prepare('SELECT id, stage_id, name FROM grade WHERE semester_id = ? ORDER BY sort_order, id')
    .all(semesterId) as { id: number; stage_id: number; name: string }[]
  const classRows = db
    .prepare(
      `SELECT k.id, k.grade_id, k.name, k.student_count, k.home_room_id, g.stage_id
         FROM klass k JOIN grade g ON g.id = k.grade_id
        WHERE g.semester_id = ? ORDER BY g.sort_order, k.sort_order, k.id`
    )
    .all(semesterId) as {
    id: number
    grade_id: number
    name: string
    student_count: number
    home_room_id: number | null
    stage_id: number
  }[]
  const classes: SolverClass[] = classRows.map((c) => ({
    id: c.id,
    gradeId: c.grade_id,
    stageId: c.stage_id,
    name: c.name,
    studentCount: c.student_count,
    homeRoomId: c.home_room_id
  }))
  const grades: SolverGrade[] = gradeRows.map((g) => ({
    id: g.id,
    stageId: g.stage_id,
    name: g.name,
    classIds: classes.filter((c) => c.gradeId === g.id).map((c) => c.id)
  }))

  // ── 教师 ──
  const teacherRows = db
    .prepare(
      'SELECT id, name, max_weekly_periods, building FROM teacher WHERE enabled = 1 ORDER BY id'
    )
    .all() as { id: number; name: string; max_weekly_periods: number; building: string | null }[]
  const tsRows = db.prepare('SELECT teacher_id, subject_id FROM teacher_subject').all() as {
    teacher_id: number
    subject_id: number
  }[]
  const teacherSubjects = new Map<number, number[]>()
  for (const r of tsRows) {
    const arr = teacherSubjects.get(r.teacher_id) ?? []
    arr.push(r.subject_id)
    teacherSubjects.set(r.teacher_id, arr)
  }
  const teachers: SolverTeacher[] = teacherRows.map((t) => ({
    id: t.id,
    name: t.name,
    maxWeeklyPeriods: t.max_weekly_periods,
    building: t.building,
    subjectIds: teacherSubjects.get(t.id) ?? []
  }))

  // ── 教室 / 场地 ──
  const roomRows = db
    .prepare(
      `SELECT id, name, room_type, capacity, concurrent_capacity, building
         FROM classroom WHERE enabled = 1 ORDER BY id`
    )
    .all() as {
    id: number
    name: string
    room_type: string
    capacity: number
    concurrent_capacity: number
    building: string | null
  }[]
  const rooms: SolverRoom[] = roomRows.map((r) => ({
    id: r.id,
    name: r.name,
    roomType: r.room_type,
    capacity: r.capacity,
    concurrentCapacity: r.concurrent_capacity,
    building: r.building
  }))

  // ── 学科（含专用场地绑定） ──
  const scRows = db
    .prepare('SELECT subject_id, classroom_id, slots_taken, priority FROM subject_classroom')
    .all() as {
    subject_id: number
    classroom_id: number
    slots_taken: number
    priority: number
  }[]
  const subjectRooms = new Map<number, SolverSubjectRoom[]>()
  for (const r of scRows) {
    const arr = subjectRooms.get(r.subject_id) ?? []
    arr.push({ classroomId: r.classroom_id, slotsTaken: r.slots_taken, priority: r.priority })
    subjectRooms.set(r.subject_id, arr)
  }
  const subjectRows = db
    .prepare(
      `SELECT id, name, short_name, importance, need_special_room, daily_max, week_spread
         FROM subject ORDER BY sort_order, id`
    )
    .all() as {
    id: number
    name: string
    short_name: string
    importance: number
    need_special_room: number
    daily_max: number
    week_spread: string
  }[]
  const subjects: SolverSubject[] = subjectRows.map((s) => ({
    id: s.id,
    name: s.name,
    shortName: s.short_name,
    importance: s.importance,
    needSpecialRoom: s.need_special_room === 1,
    dailyMax: s.daily_max,
    weekSpread: (s.week_spread === 'concentrate' ? 'concentrate' : 'spread') as
      | 'spread'
      | 'concentrate',
    allowedRooms: (subjectRooms.get(s.id) ?? []).sort((a, b) => b.priority - a.priority)
  }))

  // ── 教学任务 ──
  const taskRows = db
    .prepare(
      `SELECT id, class_id, subject_id, teacher_id, weekly_periods, consecutive_count,
              consecutive_size, week_mode, merge_group_id, fixed_room_id
         FROM teaching_task WHERE semester_id = ? ORDER BY class_id, subject_id`
    )
    .all(semesterId) as {
    id: number
    class_id: number
    subject_id: number
    teacher_id: number | null
    weekly_periods: number
    consecutive_count: number
    consecutive_size: number
    week_mode: string
    merge_group_id: number | null
    fixed_room_id: number | null
  }[]
  const tasks: SolverTask[] = taskRows.map((t) => ({
    id: t.id,
    classId: t.class_id,
    subjectId: t.subject_id,
    teacherId: t.teacher_id,
    weeklyPeriods: t.weekly_periods,
    consecutiveCount: t.consecutive_count,
    consecutiveSize: t.consecutive_size,
    weekMode: t.week_mode as WeekMode,
    mergeGroupId: t.merge_group_id,
    fixedRoomId: t.fixed_room_id
  }))

  // ── 四层时段规则 ──
  const ruleRows = db
    .prepare(
      'SELECT scope_type, scope_id, slot_id, rule_value FROM time_rule WHERE semester_id = ?'
    )
    .all(semesterId) as {
    scope_type: string
    scope_id: number | null
    slot_id: number
    rule_value: string
  }[]
  const timeRules = ruleRows.map(
    (r) =>
      ({
        scopeType: r.scope_type,
        scopeId: r.scope_id,
        slotId: r.slot_id,
        ruleValue: r.rule_value
      }) as SolverTimeRule
  )

  // ── 预排锁定 ──
  const fixedRows = db
    .prepare(
      `SELECT id, class_id, grade_id, subject_id, teacher_id, classroom_id, slot_id, label
         FROM fixed_lesson WHERE semester_id = ? ORDER BY slot_id, id`
    )
    .all(semesterId) as {
    id: number
    class_id: number | null
    grade_id: number | null
    subject_id: number | null
    teacher_id: number | null
    classroom_id: number | null
    slot_id: number
    label: string | null
  }[]
  const fixedLessons: SolverFixedLesson[] = fixedRows.map((f) => ({
    id: f.id,
    classId: f.class_id,
    gradeId: f.grade_id,
    subjectId: f.subject_id,
    teacherId: f.teacher_id,
    classroomId: f.classroom_id,
    slotId: f.slot_id,
    label: f.label
  }))

  // ── 约束组 ──
  const groupRows = db
    .prepare(
      `SELECT id, group_type, name, hardness, max_concurrent, scope_note
         FROM constraint_group WHERE semester_id = ? ORDER BY id`
    )
    .all(semesterId) as {
    id: number
    group_type: string
    name: string
    hardness: string
    max_concurrent: number | null
    scope_note: string | null
  }[]
  const memberRows =
    groupRows.length > 0
      ? (db
          .prepare(
            `SELECT group_id, member_type, member_id FROM group_member
              WHERE group_id IN (${groupRows.map(() => '?').join(',')})`
          )
          .all(...groupRows.map((g) => g.id)) as {
          group_id: number
          member_type: string
          member_id: number
        }[])
      : []
  const constraintGroups: SolverConstraintGroup[] = groupRows.map((g) => ({
    id: g.id,
    groupType: g.group_type as SolverConstraintGroup['groupType'],
    name: g.name,
    hardness: g.hardness === 'soft' ? 'soft' : 'hard',
    maxConcurrent: g.max_concurrent,
    scopeNote: g.scope_note,
    members: memberRows
      .filter((m) => m.group_id === g.id)
      .map((m) => ({
        memberType: m.member_type as SolverConstraintGroup['members'][number]['memberType'],
        memberId: m.member_id
      }))
  }))

  // ── 场地共用白名单 ──
  const coexistRows = db
    .prepare('SELECT classroom_id, subject_a, subject_b, allowed FROM room_coexist_rule')
    .all() as { classroom_id: number; subject_a: number; subject_b: number; allowed: number }[]
  const roomCoexistRules: SolverRoomCoexistRule[] = coexistRows.map((r) => ({
    classroomId: r.classroom_id,
    subjectA: r.subject_a,
    subjectB: r.subject_b,
    allowed: r.allowed === 1
  }))

  return {
    semesterId,
    semesterName: semester?.name ?? '',
    generatedAt: new Date().toISOString(),
    weightProfileCode: wp?.code ?? weightProfileCode,
    weights,
    stages,
    slots,
    grades,
    classes,
    teachers,
    subjects,
    rooms,
    tasks,
    timeRules,
    fixedLessons,
    constraintGroups,
    roomCoexistRules
  }
}

/** 组装 + 自检，一次返回。「数据可完整读出为 SolverInput」的验收入口 */
export function checkSolverInput(
  semesterId: number,
  weightProfileCode = 'balanced'
): SolverInputReport {
  return validateSolverInput(buildSolverInput(semesterId, weightProfileCode))
}
