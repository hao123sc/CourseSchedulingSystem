import { getDb } from '../connection'
import type { SubjectClassroom, SubjectRulePatch } from '@shared/types/entities'

interface SubjectClassroomRow {
  subject_id: number
  classroom_id: number
  slots_taken: number
  priority: number
}

function toEntity(r: SubjectClassroomRow): SubjectClassroom {
  return {
    subjectId: r.subject_id,
    classroomId: r.classroom_id,
    slotsTaken: r.slots_taken,
    priority: r.priority
  }
}

/**
 * 学科规则 = 落在 `subject` 表上的「每日上限 / 分布策略 / 重要性 / 是否需专用教室」
 *           + `subject_classroom` 的专用场地绑定。
 *
 * 连堂（consecutive_*）按 docs/03 存在 `teaching_task` 上，是**任务级**属性，
 * 学科规则页通过 teachingTaskRepo.setConsecutive 批量下发，不在 subject 表加冗余列。
 */
export const subjectRuleRepo = {
  /** 批量保存学科规则（单事务） */
  saveRules(patches: SubjectRulePatch[]): number {
    const db = getDb()
    const upd = db.prepare(
      `UPDATE subject SET daily_max=?, week_spread=?, importance=?, need_special_room=? WHERE id=?`
    )
    const run = db.transaction(() => {
      for (const p of patches) {
        upd.run(p.dailyMax, p.weekSpread, p.importance, p.needSpecialRoom ? 1 : 0, p.subjectId)
      }
    })
    run()
    return patches.length
  },

  listClassrooms(): SubjectClassroom[] {
    const rows = getDb()
      .prepare('SELECT * FROM subject_classroom ORDER BY subject_id, priority DESC, classroom_id')
      .all() as SubjectClassroomRow[]
    return rows.map(toEntity)
  },

  /** 覆盖式设置某学科的可用专用场地 */
  setClassrooms(subjectId: number, bindings: Omit<SubjectClassroom, 'subjectId'>[]): SubjectClassroom[] {
    const db = getDb()
    const run = db.transaction(() => {
      db.prepare('DELETE FROM subject_classroom WHERE subject_id = ?').run(subjectId)
      const ins = db.prepare(
        `INSERT OR REPLACE INTO subject_classroom (subject_id, classroom_id, slots_taken, priority)
         VALUES (?, ?, ?, ?)`
      )
      for (const b of bindings) {
        ins.run(subjectId, b.classroomId, Math.max(1, b.slotsTaken), b.priority)
      }
    })
    run()
    return this.listClassrooms().filter((b) => b.subjectId === subjectId)
  }
}
