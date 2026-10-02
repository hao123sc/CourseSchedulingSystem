import { getDb } from '../connection'
import type { FixedLessonKind } from '@shared/domain'
import type { FixedLesson, FixedLessonInput } from '@shared/types/entities'
import {
  detectFixedLessonConflicts,
  type FixedLessonConflict,
  type FixedLessonContext
} from '@shared/constraints'

interface FixedRow {
  id: number
  semester_id: number
  kind: FixedLessonKind
  class_id: number | null
  grade_id: number | null
  subject_id: number | null
  teacher_id: number | null
  classroom_id: number | null
  slot_id: number
  label: string | null
}

function toEntity(r: FixedRow): FixedLesson {
  return {
    id: r.id,
    semesterId: r.semester_id,
    kind: r.kind ?? 'lesson',
    classId: r.class_id,
    gradeId: r.grade_id,
    subjectId: r.subject_id,
    teacherId: r.teacher_id,
    classroomId: r.classroom_id,
    slotId: r.slot_id,
    label: r.label
  }
}

/** 从库里取出冲突判定所需的上下文（班级↔年级、场地并发容量） */
export function loadFixedContext(semesterId: number): FixedLessonContext {
  const db = getDb()
  const classes = db
    .prepare(
      `SELECT k.id, k.grade_id FROM klass k
        JOIN grade g ON g.id = k.grade_id WHERE g.semester_id = ?`
    )
    .all(semesterId) as { id: number; grade_id: number }[]
  const classGrade = new Map<number, number>()
  const gradeClasses = new Map<number, number[]>()
  for (const c of classes) {
    classGrade.set(c.id, c.grade_id)
    const arr = gradeClasses.get(c.grade_id) ?? []
    arr.push(c.id)
    gradeClasses.set(c.grade_id, arr)
  }
  const rooms = db.prepare('SELECT id, concurrent_capacity FROM classroom').all() as {
    id: number
    concurrent_capacity: number
  }[]
  // 课时守恒（H4）的上限来自教学任务。同一个班同一门课理论上只有一条任务，
  // 万一有重复（合班教学拆了两条）就取和，宁可放宽也不要误伤。
  const quotaRows = db
    .prepare(
      `SELECT class_id, subject_id, SUM(weekly_periods) AS periods
         FROM teaching_task WHERE semester_id = ? GROUP BY class_id, subject_id`
    )
    .all(semesterId) as { class_id: number; subject_id: number; periods: number }[]
  return {
    classGrade,
    gradeClasses,
    roomConcurrency: new Map(rooms.map((r) => [r.id, r.concurrent_capacity])),
    subjectQuota: new Map(quotaRows.map((r) => [`${r.class_id}:${r.subject_id}`, r.periods]))
  }
}

export const fixedLessonRepo = {
  listBySemester(semesterId: number): FixedLesson[] {
    const rows = getDb()
      .prepare('SELECT * FROM fixed_lesson WHERE semester_id = ? ORDER BY slot_id, id')
      .all(semesterId) as FixedRow[]
    return rows.map(toEntity)
  },

  get(id: number): FixedLesson | null {
    const row = getDb().prepare('SELECT * FROM fixed_lesson WHERE id = ?').get(id) as
      FixedRow | undefined
    return row ? toEntity(row) : null
  },

  upsert(input: FixedLessonInput): FixedLesson {
    const db = getDb()
    const kind: FixedLessonKind = input.kind ?? 'lesson'
    // block 不产生课，班级维度必须留空，避免前端漏清字段时落出自相矛盾的行
    const params = {
      semesterId: input.semesterId,
      kind,
      classId: kind === 'block' ? null : (input.classId ?? null),
      gradeId: kind === 'block' ? null : (input.gradeId ?? null),
      subjectId: kind === 'block' ? null : (input.subjectId ?? null),
      teacherId: input.teacherId ?? null,
      classroomId: input.classroomId ?? null,
      slotId: input.slotId,
      label: input.label ?? null
    }
    if (input.id != null) {
      db.prepare(
        `UPDATE fixed_lesson SET kind=@kind, class_id=@classId, grade_id=@gradeId,
           subject_id=@subjectId, teacher_id=@teacherId, classroom_id=@classroomId,
           slot_id=@slotId, label=@label
         WHERE id=@id`
      ).run({ ...params, id: input.id })
      return this.get(input.id) as FixedLesson
    }
    const info = db
      .prepare(
        `INSERT INTO fixed_lesson
           (semester_id, kind, class_id, grade_id, subject_id, teacher_id, classroom_id, slot_id, label)
         VALUES (@semesterId, @kind, @classId, @gradeId, @subjectId, @teacherId, @classroomId,
                 @slotId, @label)`
      )
      .run(params)
    return this.get(Number(info.lastInsertRowid)) as FixedLesson
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM fixed_lesson WHERE id = ?').run(id)
  },

  /** 批量为多个时段建同一种占位（如「每周一第 1 节升旗」按年级铺开） */
  bulkCreate(inputs: FixedLessonInput[]): FixedLesson[] {
    const db = getDb()
    const ins = db.prepare(
      `INSERT INTO fixed_lesson
         (semester_id, kind, class_id, grade_id, subject_id, teacher_id, classroom_id, slot_id, label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const ids: number[] = []
    const run = db.transaction(() => {
      for (const i of inputs) {
        const kind: FixedLessonKind = i.kind ?? 'lesson'
        const blocked = kind === 'block'
        const info = ins.run(
          i.semesterId,
          kind,
          blocked ? null : (i.classId ?? null),
          blocked ? null : (i.gradeId ?? null),
          blocked ? null : (i.subjectId ?? null),
          i.teacherId ?? null,
          i.classroomId ?? null,
          i.slotId,
          i.label ?? null
        )
        ids.push(Number(info.lastInsertRowid))
      }
    })
    run()
    return ids.map((id) => this.get(id)).filter((x): x is FixedLesson => x != null)
  },

  /** 全量冲突体检，逻辑复用 shared/constraints 的唯一实现 */
  conflicts(semesterId: number): FixedLessonConflict[] {
    const lessons = this.listBySemester(semesterId)
    return detectFixedLessonConflicts(lessons, loadFixedContext(semesterId))
  }
}
