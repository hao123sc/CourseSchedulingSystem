import { getDb } from '../connection'
import type { Grade, GradeInput } from '@shared/types/entities'

interface GradeRow {
  id: number
  semester_id: number
  stage_id: number
  name: string
  enroll_year: number | null
  sort_order: number
}

function toEntity(r: GradeRow): Grade {
  return {
    id: r.id,
    semesterId: r.semester_id,
    stageId: r.stage_id,
    name: r.name,
    enrollYear: r.enroll_year,
    sortOrder: r.sort_order
  }
}

export const gradeRepo = {
  list(semesterId: number): Grade[] {
    const rows = getDb()
      .prepare('SELECT * FROM grade WHERE semester_id = ? ORDER BY sort_order, id')
      .all(semesterId) as GradeRow[]
    return rows.map(toEntity)
  },

  get(id: number): Grade | null {
    const row = getDb().prepare('SELECT * FROM grade WHERE id = ?').get(id) as GradeRow | undefined
    return row ? toEntity(row) : null
  },

  upsert(input: GradeInput): Grade {
    const db = getDb()
    if (input.id != null) {
      db.prepare(
        `UPDATE grade SET stage_id=@stageId, name=@name, enroll_year=@enrollYear, sort_order=@sortOrder
         WHERE id=@id`
      ).run({
        id: input.id,
        stageId: input.stageId,
        name: input.name,
        enrollYear: input.enrollYear ?? null,
        sortOrder: input.sortOrder ?? 0
      })
      return this.get(input.id) as Grade
    }
    const info = db
      .prepare(
        `INSERT INTO grade (semester_id, stage_id, name, enroll_year, sort_order)
         VALUES (@semesterId, @stageId, @name, @enrollYear, @sortOrder)`
      )
      .run({
        semesterId: input.semesterId,
        stageId: input.stageId,
        name: input.name,
        enrollYear: input.enrollYear ?? null,
        sortOrder: input.sortOrder ?? 0
      })
    return this.get(Number(info.lastInsertRowid)) as Grade
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM grade WHERE id = ?').run(id)
  }
}
