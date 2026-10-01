import { getDb } from '../connection'
import type { Teacher, TeacherInput } from '@shared/types/entities'

interface TeacherRow {
  id: number
  name: string
  staff_no: string | null
  phone: string | null
  max_weekly_periods: number
  building: string | null
  enabled: number
}

function toEntity(r: TeacherRow, subjectIds: number[]): Teacher {
  return {
    id: r.id,
    name: r.name,
    staffNo: r.staff_no,
    phone: r.phone,
    maxWeeklyPeriods: r.max_weekly_periods,
    building: r.building,
    enabled: r.enabled === 1,
    subjectIds
  }
}

function loadSubjectMap(): Map<number, number[]> {
  const rows = getDb().prepare('SELECT teacher_id, subject_id FROM teacher_subject').all() as {
    teacher_id: number
    subject_id: number
  }[]
  const map = new Map<number, number[]>()
  for (const r of rows) {
    const arr = map.get(r.teacher_id) ?? []
    arr.push(r.subject_id)
    map.set(r.teacher_id, arr)
  }
  return map
}

function replaceSubjects(teacherId: number, subjectIds: number[]): void {
  const db = getDb()
  db.prepare('DELETE FROM teacher_subject WHERE teacher_id = ?').run(teacherId)
  if (subjectIds.length === 0) return
  const insert = db.prepare(
    'INSERT OR IGNORE INTO teacher_subject (teacher_id, subject_id) VALUES (?, ?)'
  )
  for (const sid of subjectIds) insert.run(teacherId, sid)
}

export const teacherRepo = {
  list(): Teacher[] {
    const rows = getDb().prepare('SELECT * FROM teacher ORDER BY id').all() as TeacherRow[]
    const map = loadSubjectMap()
    return rows.map((r) => toEntity(r, map.get(r.id) ?? []))
  },

  get(id: number): Teacher | null {
    const row = getDb().prepare('SELECT * FROM teacher WHERE id = ?').get(id) as
      TeacherRow | undefined
    if (!row) return null
    const subjectIds = (
      getDb().prepare('SELECT subject_id FROM teacher_subject WHERE teacher_id = ?').all(id) as {
        subject_id: number
      }[]
    ).map((x) => x.subject_id)
    return toEntity(row, subjectIds)
  },

  upsert(input: TeacherInput): Teacher {
    const db = getDb()
    const params = {
      name: input.name,
      staffNo: input.staffNo ?? null,
      phone: input.phone ?? null,
      maxWeeklyPeriods: input.maxWeeklyPeriods ?? 18,
      building: input.building ?? null,
      enabled: input.enabled === false ? 0 : 1
    }
    const tx = db.transaction((): number => {
      let id: number
      if (input.id != null) {
        db.prepare(
          `UPDATE teacher SET name=@name, staff_no=@staffNo, phone=@phone,
             max_weekly_periods=@maxWeeklyPeriods, building=@building, enabled=@enabled WHERE id=@id`
        ).run({ ...params, id: input.id })
        id = input.id
      } else {
        const info = db
          .prepare(
            `INSERT INTO teacher (name, staff_no, phone, max_weekly_periods, building, enabled)
             VALUES (@name, @staffNo, @phone, @maxWeeklyPeriods, @building, @enabled)`
          )
          .run(params)
        id = Number(info.lastInsertRowid)
      }
      if (input.subjectIds) replaceSubjects(id, input.subjectIds)
      return id
    })
    const id = tx()
    return this.get(id) as Teacher
  },

  delete(id: number): void {
    // teacher_subject 有 ON DELETE CASCADE，随之清理
    getDb().prepare('DELETE FROM teacher WHERE id = ?').run(id)
  }
}
