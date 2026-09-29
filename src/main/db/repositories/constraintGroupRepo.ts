import { getDb } from '../connection'
import type { ConstraintGroup, ConstraintGroupInput, GroupMember } from '@shared/types/entities'
import type { GroupHardness, GroupMemberType, GroupType } from '@shared/domain'

interface GroupRow {
  id: number
  semester_id: number
  group_type: string
  name: string
  hardness: string
  max_concurrent: number | null
  scope_note: string | null
}

function toEntity(r: GroupRow, members: GroupMember[]): ConstraintGroup {
  return {
    id: r.id,
    semesterId: r.semester_id,
    groupType: r.group_type as GroupType,
    name: r.name,
    hardness: r.hardness as GroupHardness,
    maxConcurrent: r.max_concurrent,
    scopeNote: r.scope_note,
    members
  }
}

function loadMembers(groupIds: number[]): Map<number, GroupMember[]> {
  const map = new Map<number, GroupMember[]>()
  if (groupIds.length === 0) return map
  const rows = getDb()
    .prepare(
      `SELECT group_id, member_type, member_id FROM group_member
        WHERE group_id IN (${groupIds.map(() => '?').join(',')})`
    )
    .all(...groupIds) as { group_id: number; member_type: string; member_id: number }[]
  for (const r of rows) {
    const arr = map.get(r.group_id) ?? []
    arr.push({ memberType: r.member_type as GroupMemberType, memberId: r.member_id })
    map.set(r.group_id, arr)
  }
  return map
}

export const constraintGroupRepo = {
  listBySemester(semesterId: number): ConstraintGroup[] {
    const rows = getDb()
      .prepare('SELECT * FROM constraint_group WHERE semester_id = ? ORDER BY id')
      .all(semesterId) as GroupRow[]
    const members = loadMembers(rows.map((r) => r.id))
    return rows.map((r) => toEntity(r, members.get(r.id) ?? []))
  },

  get(id: number): ConstraintGroup | null {
    const row = getDb().prepare('SELECT * FROM constraint_group WHERE id = ?').get(id) as
      | GroupRow
      | undefined
    if (!row) return null
    return toEntity(row, loadMembers([id]).get(id) ?? [])
  },

  upsert(input: ConstraintGroupInput): ConstraintGroup {
    const db = getDb()
    const params = {
      semesterId: input.semesterId,
      groupType: input.groupType,
      name: input.name,
      hardness: input.hardness ?? 'hard',
      maxConcurrent: input.maxConcurrent ?? null,
      scopeNote: input.scopeNote ?? null
    }

    const save = db.transaction(() => {
      let id: number
      if (input.id != null) {
        db.prepare(
          `UPDATE constraint_group SET group_type=@groupType, name=@name, hardness=@hardness,
             max_concurrent=@maxConcurrent, scope_note=@scopeNote WHERE id=@id`
        ).run({ ...params, id: input.id })
        id = input.id
      } else {
        const info = db
          .prepare(
            `INSERT INTO constraint_group (semester_id, group_type, name, hardness, max_concurrent, scope_note)
             VALUES (@semesterId, @groupType, @name, @hardness, @maxConcurrent, @scopeNote)`
          )
          .run(params)
        id = Number(info.lastInsertRowid)
      }
      db.prepare('DELETE FROM group_member WHERE group_id = ?').run(id)
      const ins = db.prepare(
        'INSERT OR IGNORE INTO group_member (group_id, member_type, member_id) VALUES (?, ?, ?)'
      )
      for (const m of input.members) ins.run(id, m.memberType, m.memberId)
      return id
    })

    return this.get(save()) as ConstraintGroup
  },

  delete(id: number): void {
    // group_member 有 ON DELETE CASCADE；teaching_task.merge_group_id 为 SET NULL
    getDb().prepare('DELETE FROM constraint_group WHERE id = ?').run(id)
  }
}
