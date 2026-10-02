import { getDb } from '../connection'
import type { ClassBatchInput, Klass, KlassInput } from '@shared/types/entities'
import { buildBatchNames, defaultShortName } from '@shared/classNaming'
import { gradeRepo } from './gradeRepo'

interface KlassRow {
  id: number
  grade_id: number
  name: string
  short_name: string | null
  student_count: number
  head_teacher_id: number | null
  home_room_id: number | null
  is_virtual: number
  sort_order: number
}

function toEntity(r: KlassRow): Klass {
  return {
    id: r.id,
    gradeId: r.grade_id,
    name: r.name,
    shortName: r.short_name,
    studentCount: r.student_count,
    headTeacherId: r.head_teacher_id,
    homeRoomId: r.home_room_id,
    isVirtual: r.is_virtual === 1,
    sortOrder: r.sort_order
  }
}

export const classRepo = {
  listByGrade(gradeId: number): Klass[] {
    const rows = getDb()
      .prepare('SELECT * FROM klass WHERE grade_id = ? ORDER BY sort_order, id')
      .all(gradeId) as KlassRow[]
    return rows.map(toEntity)
  },

  listBySemester(semesterId: number): Klass[] {
    const rows = getDb()
      .prepare(
        `SELECT k.* FROM klass k
         JOIN grade g ON g.id = k.grade_id
         WHERE g.semester_id = ?
         ORDER BY g.sort_order, k.sort_order, k.id`
      )
      .all(semesterId) as KlassRow[]
    return rows.map(toEntity)
  },

  get(id: number): Klass | null {
    const row = getDb().prepare('SELECT * FROM klass WHERE id = ?').get(id) as KlassRow | undefined
    return row ? toEntity(row) : null
  },

  upsert(input: KlassInput): Klass {
    const db = getDb()
    if (input.id != null) {
      db.prepare(
        `UPDATE klass SET grade_id=@gradeId, name=@name, short_name=@shortName,
           student_count=@studentCount, head_teacher_id=@headTeacherId, home_room_id=@homeRoomId,
           is_virtual=@isVirtual, sort_order=@sortOrder WHERE id=@id`
      ).run({
        id: input.id,
        gradeId: input.gradeId,
        name: input.name,
        shortName: input.shortName ?? null,
        studentCount: input.studentCount ?? 45,
        headTeacherId: input.headTeacherId ?? null,
        homeRoomId: input.homeRoomId ?? null,
        isVirtual: input.isVirtual ? 1 : 0,
        sortOrder: input.sortOrder ?? 0
      })
      return this.get(input.id) as Klass
    }
    const info = db
      .prepare(
        `INSERT INTO klass (grade_id, name, short_name, student_count, head_teacher_id, home_room_id, is_virtual, sort_order)
         VALUES (@gradeId, @name, @shortName, @studentCount, @headTeacherId, @homeRoomId, @isVirtual, @sortOrder)`
      )
      .run({
        gradeId: input.gradeId,
        name: input.name,
        shortName: input.shortName ?? null,
        studentCount: input.studentCount ?? 45,
        headTeacherId: input.headTeacherId ?? null,
        homeRoomId: input.homeRoomId ?? null,
        isVirtual: input.isVirtual ? 1 : 0,
        sortOrder: input.sortOrder ?? 0
      })
    return this.get(Number(info.lastInsertRowid)) as Klass
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM klass WHERE id = ?').run(id)
  },

  /** 批量生成 N 个班，序号接在该年级现有班级之后 */
  batchCreate(input: ClassBatchInput): Klass[] {
    const db = getDb()
    const grade = gradeRepo.get(input.gradeId)
    if (!grade) throw new Error(`年级不存在: ${input.gradeId}`)

    const existing = this.listByGrade(input.gradeId)
    const startIndex = input.startIndex ?? existing.length + 1
    const names = buildBatchNames(input.namePattern, input.count, grade.name, startIndex)

    const insert = db.prepare(
      `INSERT INTO klass (grade_id, name, short_name, student_count, is_virtual, sort_order)
       VALUES (@gradeId, @name, @shortName, @studentCount, 0, @sortOrder)`
    )
    const created: number[] = []
    const tx = db.transaction(() => {
      names.forEach((name, i) => {
        const idx = startIndex + i
        const info = insert.run({
          gradeId: input.gradeId,
          name,
          shortName: defaultShortName(idx),
          studentCount: input.studentCount ?? 45,
          sortOrder: idx
        })
        created.push(Number(info.lastInsertRowid))
      })
    })
    tx()
    return created.map((id) => this.get(id) as Klass)
  }
}
