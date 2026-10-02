import { getDb } from '../connection'
import type { PeriodTemplate, Stage, StageInput, TimeSlot } from '@shared/types/entities'
import type { Segment } from '@shared/domain'

interface StageRow {
  id: number
  code: string
  name: string
  sort_order: number
  days_per_week: number
  has_evening: number
  enabled: number
}
interface TimeSlotRow {
  id: number
  stage_id: number
  day_of_week: number
  period_index: number
  period_name: string
  segment: string
  start_time: string | null
  end_time: string | null
  is_teaching: number
  sort_order: number
}

function toStage(r: StageRow): Stage {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    sortOrder: r.sort_order,
    daysPerWeek: r.days_per_week,
    hasEvening: r.has_evening === 1,
    enabled: r.enabled === 1
  }
}
function toSlot(r: TimeSlotRow): TimeSlot {
  return {
    id: r.id,
    stageId: r.stage_id,
    dayOfWeek: r.day_of_week,
    periodIndex: r.period_index,
    periodName: r.period_name,
    segment: r.segment as Segment,
    startTime: r.start_time,
    endTime: r.end_time,
    isTeaching: r.is_teaching === 1,
    sortOrder: r.sort_order
  }
}

export const stageRepo = {
  list(): Stage[] {
    const rows = getDb().prepare('SELECT * FROM stage ORDER BY sort_order, id').all() as StageRow[]
    return rows.map(toStage)
  },

  get(id: number): Stage | null {
    const row = getDb().prepare('SELECT * FROM stage WHERE id = ?').get(id) as StageRow | undefined
    return row ? toStage(row) : null
  },

  upsert(input: StageInput): Stage {
    const db = getDb()
    if (input.id != null) {
      db.prepare(
        `UPDATE stage SET code=@code, name=@name, sort_order=@sortOrder,
           days_per_week=@daysPerWeek, has_evening=@hasEvening, enabled=@enabled WHERE id=@id`
      ).run({
        id: input.id,
        code: input.code,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
        daysPerWeek: input.daysPerWeek ?? 5,
        hasEvening: input.hasEvening ? 1 : 0,
        enabled: input.enabled === false ? 0 : 1
      })
      return this.get(input.id) as Stage
    }
    const info = db
      .prepare(
        `INSERT INTO stage (code, name, sort_order, days_per_week, has_evening, enabled)
         VALUES (@code, @name, @sortOrder, @daysPerWeek, @hasEvening, @enabled)`
      )
      .run({
        code: input.code,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
        daysPerWeek: input.daysPerWeek ?? 5,
        hasEvening: input.hasEvening ? 1 : 0,
        enabled: input.enabled === false ? 0 : 1
      })
    return this.get(Number(info.lastInsertRowid)) as Stage
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM stage WHERE id = ?').run(id)
  },

  listSlots(stageId: number): TimeSlot[] {
    const rows = getDb()
      .prepare(
        'SELECT * FROM time_slot WHERE stage_id = ? ORDER BY day_of_week, sort_order, period_index'
      )
      .all(stageId) as TimeSlotRow[]
    return rows.map(toSlot)
  },

  /**
   * 用一套节次模板覆盖某学段全部作息：删除旧 time_slot，按 days_per_week 天数复制模板逐天写入。
   * 事务保证不会出现"删了旧的、没写成新的"。
   */
  replaceSlots(stageId: number, periods: PeriodTemplate[]): TimeSlot[] {
    const db = getDb()
    const stage = this.get(stageId)
    if (!stage) throw new Error(`学段不存在: ${stageId}`)
    const days = stage.daysPerWeek
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM time_slot WHERE stage_id = ?').run(stageId)
      const insert = db.prepare(
        `INSERT INTO time_slot
           (stage_id, day_of_week, period_index, period_name, segment, start_time, end_time, is_teaching, sort_order)
         VALUES (@stageId, @day, @periodIndex, @periodName, @segment, @startTime, @endTime, @isTeaching, @sortOrder)`
      )
      for (let day = 1; day <= days; day++) {
        periods.forEach((p, idx) => {
          insert.run({
            stageId,
            day,
            periodIndex: p.periodIndex,
            periodName: p.periodName,
            segment: p.segment,
            startTime: p.startTime ?? null,
            endTime: p.endTime ?? null,
            isTeaching: p.isTeaching === false ? 0 : 1,
            sortOrder: idx + 1
          })
        })
      }
    })
    tx()
    return this.listSlots(stageId)
  }
}
