import { getDb } from '../connection'
import type { Classroom, ClassroomInput } from '@shared/types/entities'
import type { RoomType } from '@shared/domain'

interface ClassroomRow {
  id: number
  name: string
  room_type: string
  capacity: number
  concurrent_capacity: number
  building: string | null
  enabled: number
}

function toEntity(r: ClassroomRow): Classroom {
  return {
    id: r.id,
    name: r.name,
    roomType: r.room_type as RoomType,
    capacity: r.capacity,
    concurrentCapacity: r.concurrent_capacity,
    building: r.building,
    enabled: r.enabled === 1
  }
}

export const classroomRepo = {
  list(): Classroom[] {
    const rows = getDb().prepare('SELECT * FROM classroom ORDER BY id').all() as ClassroomRow[]
    return rows.map(toEntity)
  },

  get(id: number): Classroom | null {
    const row = getDb().prepare('SELECT * FROM classroom WHERE id = ?').get(id) as
      ClassroomRow | undefined
    return row ? toEntity(row) : null
  },

  upsert(input: ClassroomInput): Classroom {
    const db = getDb()
    const params = {
      name: input.name,
      roomType: input.roomType ?? 'normal',
      capacity: input.capacity ?? 50,
      concurrentCapacity: input.concurrentCapacity ?? 1,
      building: input.building ?? null,
      enabled: input.enabled === false ? 0 : 1
    }
    if (input.id != null) {
      db.prepare(
        `UPDATE classroom SET name=@name, room_type=@roomType, capacity=@capacity,
           concurrent_capacity=@concurrentCapacity, building=@building, enabled=@enabled WHERE id=@id`
      ).run({ ...params, id: input.id })
      return this.get(input.id) as Classroom
    }
    const info = db
      .prepare(
        `INSERT INTO classroom (name, room_type, capacity, concurrent_capacity, building, enabled)
         VALUES (@name, @roomType, @capacity, @concurrentCapacity, @building, @enabled)`
      )
      .run(params)
    return this.get(Number(info.lastInsertRowid)) as Classroom
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM classroom WHERE id = ?').run(id)
  }
}
