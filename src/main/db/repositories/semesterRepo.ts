import { getDb } from '../connection'
import type { Semester, SemesterInput } from '@shared/types/entities'

interface SemesterRow {
  id: number
  name: string
  start_date: string | null
  end_date: string | null
  is_current: number
  created_at: string
}

function toEntity(r: SemesterRow): Semester {
  return {
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    isCurrent: r.is_current === 1,
    createdAt: r.created_at
  }
}

export const semesterRepo = {
  list(): Semester[] {
    const rows = getDb()
      .prepare('SELECT * FROM semester ORDER BY is_current DESC, id DESC')
      .all() as SemesterRow[]
    return rows.map(toEntity)
  },

  getCurrent(): Semester | null {
    const row = getDb().prepare('SELECT * FROM semester WHERE is_current = 1').get() as
      SemesterRow | undefined
    return row ? toEntity(row) : null
  },

  get(id: number): Semester | null {
    const row = getDb().prepare('SELECT * FROM semester WHERE id = ?').get(id) as
      SemesterRow | undefined
    return row ? toEntity(row) : null
  },

  upsert(input: SemesterInput): Semester {
    const db = getDb()
    if (input.id != null) {
      db.prepare(
        `UPDATE semester SET name = @name, start_date = @startDate, end_date = @endDate WHERE id = @id`
      ).run({
        id: input.id,
        name: input.name,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null
      })
      return this.get(input.id) as Semester
    }
    // 首个学期自动设为当前学期
    const count = (getDb().prepare('SELECT COUNT(*) AS c FROM semester').get() as { c: number }).c
    const info = db
      .prepare(
        `INSERT INTO semester (name, start_date, end_date, is_current)
         VALUES (@name, @startDate, @endDate, @isCurrent)`
      )
      .run({
        name: input.name,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        isCurrent: count === 0 ? 1 : 0
      })
    return this.get(Number(info.lastInsertRowid)) as Semester
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM semester WHERE id = ?').run(id)
  },

  /** 设为当前学期：唯一索引 ux_semester_current 要求全表只能有一行 is_current=1，故先清后置 */
  setCurrent(id: number): void {
    const db = getDb()
    const tx = db.transaction(() => {
      db.prepare('UPDATE semester SET is_current = 0 WHERE is_current = 1').run()
      db.prepare('UPDATE semester SET is_current = 1 WHERE id = ?').run(id)
    })
    tx()
  }
}
