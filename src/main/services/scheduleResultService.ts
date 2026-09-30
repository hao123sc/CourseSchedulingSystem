import { randomUUID } from 'crypto'
import { getDb } from '../db/connection'
import type { PlacedLesson } from '@solver/model/solution'
import type { Lesson, ScheduleVersion } from '@shared/types/entities'

/**
 * 排课结果落库（M3 后半段）：`solve()` 的输出 → `schedule_version` + `lesson`。
 *
 * 口径（PROGRESS.md 已锁定，勿改）：
 *  · 拼合组是「同槽、各班各占一间场地」，PlacedLesson 已按班展开好 classroomId，
 *    这里逐行照抄即可，**绝不**把第一班的场地套给所有班；
 *  · 连堂块（blockSize ≥ 2）的每节课带同一个 `consecutive_group`（uuid），
 *    分组键是引擎的 unitId；
 *  · 预排锁定 kind='lesson' 且带学科的，是真正「钉死」的课：以 is_locked=1 一起写进
 *    该版本（课表页一个查询就能拿全）；年级级预排展开到该年级每个班；
 *    无学科的纯占位（升旗 / 早读 / 晚自习）不产生课，由课表页叠加 fixed_lesson 显示；
 *  · 整个写入在一个事务里：任何一行失败（如 task_id 外键）全部回滚，不留半个版本。
 */
export interface SaveScheduleParams {
  semesterId: number
  weightProfileCode: string
  solveMs: number
  hardViolations: number
  softScore?: number
  metrics?: Record<string, unknown>
  /** 引擎排出的课（toPlacedLessons 的输出） */
  lessons: PlacedLesson[]
}

export interface SaveScheduleResult {
  versionId: number
  name: string
  /** 引擎排出的课行数 */
  lessonCount: number
  /** 预排锁定落库的课行数 */
  lockedCount: number
  /** 带学科预排却找不到对应教学任务而被跳过的节数（数据不一致时才会出现） */
  skippedFixed: number
}

interface FixedLessonRow {
  id: number
  class_id: number | null
  grade_id: number | null
  subject_id: number
  teacher_id: number | null
  classroom_id: number | null
  slot_id: number
  label: string | null
}

export function saveSchedule(p: SaveScheduleParams): SaveScheduleResult {
  const db = getDb()

  // 版本名：「自动排课 #N · 档位名」，N 按本学期已有版本数递增
  const profile = db
    .prepare('SELECT name FROM weight_profile WHERE code = ?')
    .get(p.weightProfileCode) as { name: string } | undefined
  const seq =
    (
      db
        .prepare('SELECT COUNT(*) AS n FROM schedule_version WHERE semester_id = ?')
        .get(p.semesterId) as { n: number }
    ).n + 1
  const name = `自动排课 #${seq} · ${profile?.name ?? p.weightProfileCode}`

  // ── 预排锁定（带学科）展开：年级级 → 每个班；同班同科多条任务取第一条 ──
  const fixedRows = db
    .prepare(
      `SELECT id, class_id, grade_id, subject_id, teacher_id, classroom_id, slot_id, label
         FROM fixed_lesson
        WHERE semester_id = ? AND kind = 'lesson' AND subject_id IS NOT NULL`
    )
    .all(p.semesterId) as FixedLessonRow[]

  const classesInGrade = new Map<number, number[]>()
  const classRows = db
    .prepare(
      `SELECT k.id, k.grade_id FROM klass k JOIN grade g ON g.id = k.grade_id WHERE g.semester_id = ?`
    )
    .all(p.semesterId) as { id: number; grade_id: number }[]
  for (const c of classRows) {
    const arr = classesInGrade.get(c.grade_id)
    if (arr) arr.push(c.id)
    else classesInGrade.set(c.grade_id, [c.id])
  }

  const taskOf = new Map<string, number>()
  /** 本学期「真的有人在上」的学科：班会这类全学期无任务的纯占位不算数据不一致 */
  const subjectsWithTasks = new Set<number>()
  const taskRows = db
    .prepare('SELECT id, class_id, subject_id FROM teaching_task WHERE semester_id = ?')
    .all(p.semesterId) as { id: number; class_id: number; subject_id: number }[]
  for (const t of taskRows) {
    subjectsWithTasks.add(t.subject_id)
    const k = `${t.class_id}:${t.subject_id}`
    if (!taskOf.has(k)) taskOf.set(k, t.id)
  }

  const insVersion = db.prepare(
    `INSERT INTO schedule_version
       (semester_id, name, weight_profile, hard_violations, soft_score, metrics, solve_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  const insLesson = db.prepare(
    `INSERT INTO lesson
       (version_id, task_id, class_id, subject_id, teacher_id, classroom_id, slot_id,
        week_mode, is_locked, consecutive_group, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const tx = db.transaction((): SaveScheduleResult => {
    const versionId = Number(
      insVersion.run(
        p.semesterId,
        name,
        p.weightProfileCode,
        p.hardViolations,
        p.softScore ?? 0,
        JSON.stringify(p.metrics ?? {}),
        p.solveMs
      ).lastInsertRowid
    )

    // 1) 引擎排出的课（is_locked = 0）
    const cgOf = new Map<number, string>()
    for (const l of p.lessons) {
      let cg: string | null = null
      if (l.blockSize > 1) {
        let g = cgOf.get(l.unitId)
        if (g == null) {
          g = randomUUID()
          cgOf.set(l.unitId, g)
        }
        cg = g
      }
      insLesson.run(
        versionId,
        l.taskId,
        l.classId,
        l.subjectId,
        l.teacherId,
        l.classroomId,
        l.slotId,
        l.weekMode,
        0,
        cg,
        null
      )
    }

    // 2) 预排锁定的课（is_locked = 1）
    let lockedCount = 0
    let skippedFixed = 0
    for (const f of fixedRows) {
      // 班会这类「带学科但全学期无教学任务」的占位：不是课，由课表页叠加
      // fixed_lesson 显示（升旗 / 早读 / 晚自习同路），不计入 skippedFixed
      if (!subjectsWithTasks.has(f.subject_id)) continue
      const classIds =
        f.class_id != null ? [f.class_id] : (classesInGrade.get(f.grade_id ?? -1) ?? [])
      for (const cid of classIds) {
        const taskId = taskOf.get(`${cid}:${f.subject_id}`)
        if (taskId == null) {
          // 该学科别的班在开、这个班却没开——预排钉了一节不存在的课，值得报出来
          skippedFixed += 1
          continue
        }
        insLesson.run(
          versionId,
          taskId,
          cid,
          f.subject_id,
          f.teacher_id,
          f.classroom_id,
          f.slot_id,
          'all',
          1,
          null,
          f.label ?? '预排锁定'
        )
        lockedCount += 1
      }
    }

    return { versionId, name, lessonCount: p.lessons.length, lockedCount, skippedFixed }
  })

  return tx()
}

export function listVersions(semesterId: number): ScheduleVersion[] {
  const rows = getDb()
    .prepare(
      `SELECT v.id, v.semester_id, v.parent_id, v.name, v.weight_profile, v.hard_violations,
              v.soft_score, v.metrics, v.solve_ms, v.is_published, v.created_at,
              (SELECT COUNT(*) FROM lesson l WHERE l.version_id = v.id) AS lesson_count
         FROM schedule_version v
        WHERE v.semester_id = ?
        ORDER BY v.id DESC`
    )
    .all(semesterId) as {
    id: number
    semester_id: number
    parent_id: number | null
    name: string
    weight_profile: string | null
    hard_violations: number
    soft_score: number
    metrics: string | null
    solve_ms: number | null
    is_published: number
    created_at: string
    lesson_count: number
  }[]

  return rows.map((r) => {
    let metrics: Record<string, unknown> | null = null
    if (r.metrics) {
      try {
        metrics = JSON.parse(r.metrics) as Record<string, unknown>
      } catch {
        metrics = null
      }
    }
    return {
      id: r.id,
      semesterId: r.semester_id,
      parentId: r.parent_id,
      name: r.name,
      weightProfile: r.weight_profile,
      hardViolations: r.hard_violations,
      softScore: r.soft_score,
      metrics,
      solveMs: r.solve_ms,
      isPublished: r.is_published === 1,
      createdAt: r.created_at,
      lessonCount: r.lesson_count
    }
  })
}

export function deleteVersion(id: number): void {
  getDb().prepare('DELETE FROM schedule_version WHERE id = ?').run(id)
}

export interface AdjustLessonSlotParams {
  versionId: number
  lessonId: number
  toSlotId: number
  reason?: string
}

/** M6 持久化单课换位；数据库事务是最后一道锁定课程与版本归属校验。 */
export function adjustLessonSlot(p: AdjustLessonSlotParams): Lesson {
  const db = getDb()
  const tx = db.transaction((): Lesson => {
    const row = db.prepare(
      `SELECT id, version_id, task_id, class_id, subject_id, teacher_id, classroom_id,
              slot_id, week_mode, is_locked, consecutive_group, remark
         FROM lesson WHERE id = ? AND version_id = ?`
    ).get(p.lessonId, p.versionId) as {
      id: number; version_id: number; task_id: number; class_id: number; subject_id: number;
      teacher_id: number | null; classroom_id: number | null; slot_id: number; week_mode: string;
      is_locked: number; consecutive_group: string | null; remark: string | null
    } | undefined
    if (!row) throw new Error('课程不属于当前课表版本')
    if (row.is_locked) throw new Error('预排锁定课程不可移动')
    const slot = db.prepare('SELECT id FROM time_slot WHERE id = ?').get(p.toSlotId) as { id: number } | undefined
    if (!slot) throw new Error('目标时段不存在')
    const before = { slotId: row.slot_id }
    db.prepare('UPDATE lesson SET slot_id = ? WHERE id = ? AND version_id = ?').run(p.toSlotId, p.lessonId, p.versionId)
    db.prepare(
      `INSERT INTO adjust_log(version_id, action, before_json, after_json, reason)
       VALUES (?, 'move', ?, ?, ?)`
    ).run(p.versionId, JSON.stringify({ lessonId: p.lessonId, ...before }), JSON.stringify({ lessonId: p.lessonId, slotId: p.toSlotId }), p.reason ?? null)
    return {
      id: row.id, versionId: row.version_id, taskId: row.task_id, classId: row.class_id,
      subjectId: row.subject_id, teacherId: row.teacher_id, classroomId: row.classroom_id,
      slotId: p.toSlotId, weekMode: row.week_mode as Lesson['weekMode'], isLocked: false,
      consecutiveGroup: row.consecutive_group, remark: row.remark
    }
  })
  return tx()
}

/** 单个版本的课表行（M4 课表页的数据源之一；预排无学科占位另由 fixed_lesson 叠加） */
export function getVersionLessons(versionId: number): Lesson[] {
  const rows = getDb()
    .prepare(
      `SELECT id, version_id, task_id, class_id, subject_id, teacher_id, classroom_id,
              slot_id, week_mode, is_locked, consecutive_group, remark
         FROM lesson WHERE version_id = ? ORDER BY slot_id, id`
    )
    .all(versionId) as {
    id: number
    version_id: number
    task_id: number
    class_id: number
    subject_id: number
    teacher_id: number | null
    classroom_id: number | null
    slot_id: number
    week_mode: string
    is_locked: number
    consecutive_group: string | null
    remark: string | null
  }[]
  return rows.map((r) => ({
    id: r.id,
    versionId: r.version_id,
    taskId: r.task_id,
    classId: r.class_id,
    subjectId: r.subject_id,
    teacherId: r.teacher_id,
    classroomId: r.classroom_id,
    slotId: r.slot_id,
    weekMode: r.week_mode as Lesson['weekMode'],
    isLocked: r.is_locked === 1,
    consecutiveGroup: r.consecutive_group,
    remark: r.remark
  }))
}
