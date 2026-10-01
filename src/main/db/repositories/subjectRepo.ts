import { getDb } from '../connection'
import type { Subject, SubjectInput } from '@shared/types/entities'
import type { SubjectCategory, WeekSpread } from '@shared/domain'

interface SubjectRow {
  id: number
  name: string
  short_name: string
  color: string
  category: string
  importance: number
  need_special_room: number
  stage_id: number | null
  daily_max: number
  week_spread: string
  sort_order: number
}

function toEntity(r: SubjectRow): Subject {
  return {
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    color: r.color,
    category: r.category as SubjectCategory,
    importance: r.importance,
    needSpecialRoom: r.need_special_room === 1,
    stageId: r.stage_id,
    dailyMax: r.daily_max,
    weekSpread: r.week_spread as WeekSpread,
    sortOrder: r.sort_order
  }
}

export const subjectRepo = {
  list(): Subject[] {
    const rows = getDb()
      .prepare('SELECT * FROM subject ORDER BY sort_order, id')
      .all() as SubjectRow[]
    return rows.map(toEntity)
  },

  get(id: number): Subject | null {
    const row = getDb().prepare('SELECT * FROM subject WHERE id = ?').get(id) as
      SubjectRow | undefined
    return row ? toEntity(row) : null
  },

  upsert(input: SubjectInput): Subject {
    const db = getDb()
    const params = {
      name: input.name,
      shortName: input.shortName,
      color: input.color,
      category: input.category ?? 'main',
      importance: input.importance ?? 3,
      needSpecialRoom: input.needSpecialRoom ? 1 : 0,
      stageId: input.stageId ?? null,
      dailyMax: input.dailyMax ?? 1,
      weekSpread: input.weekSpread ?? 'spread',
      sortOrder: input.sortOrder ?? 0
    }
    if (input.id != null) {
      db.prepare(
        `UPDATE subject SET name=@name, short_name=@shortName, color=@color, category=@category,
           importance=@importance, need_special_room=@needSpecialRoom, stage_id=@stageId,
           daily_max=@dailyMax, week_spread=@weekSpread, sort_order=@sortOrder WHERE id=@id`
      ).run({ ...params, id: input.id })
      return this.get(input.id) as Subject
    }
    const info = db
      .prepare(
        `INSERT INTO subject (name, short_name, color, category, importance, need_special_room, stage_id, daily_max, week_spread, sort_order)
         VALUES (@name, @shortName, @color, @category, @importance, @needSpecialRoom, @stageId, @dailyMax, @weekSpread, @sortOrder)`
      )
      .run(params)
    return this.get(Number(info.lastInsertRowid)) as Subject
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM subject WHERE id = ?').run(id)
  }
}
