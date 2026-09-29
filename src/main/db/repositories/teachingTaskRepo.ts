import { getDb } from '../connection'
import type {
  CurriculumApplyResult,
  MatrixCellPatch,
  TeachingTask,
  TeachingTaskInput,
  TeacherWorkload
} from '@shared/types/entities'
import type { WeekMode } from '@shared/domain'
import { findPlan } from '@shared/curriculumPresets'

interface TaskRow {
  id: number
  semester_id: number
  class_id: number
  subject_id: number
  teacher_id: number | null
  weekly_periods: number
  consecutive_count: number
  consecutive_size: number
  week_mode: string
  merge_group_id: number | null
  fixed_room_id: number | null
}

function toEntity(r: TaskRow): TeachingTask {
  return {
    id: r.id,
    semesterId: r.semester_id,
    classId: r.class_id,
    subjectId: r.subject_id,
    teacherId: r.teacher_id,
    weeklyPeriods: r.weekly_periods,
    consecutiveCount: r.consecutive_count,
    consecutiveSize: r.consecutive_size,
    weekMode: r.week_mode as WeekMode,
    mergeGroupId: r.merge_group_id,
    fixedRoomId: r.fixed_room_id
  }
}

export const teachingTaskRepo = {
  listBySemester(semesterId: number): TeachingTask[] {
    const rows = getDb()
      .prepare('SELECT * FROM teaching_task WHERE semester_id = ? ORDER BY class_id, subject_id')
      .all(semesterId) as TaskRow[]
    return rows.map(toEntity)
  },

  get(id: number): TeachingTask | null {
    const row = getDb().prepare('SELECT * FROM teaching_task WHERE id = ?').get(id) as
      | TaskRow
      | undefined
    return row ? toEntity(row) : null
  },

  upsert(input: TeachingTaskInput): TeachingTask {
    const db = getDb()
    const params = {
      semesterId: input.semesterId,
      classId: input.classId,
      subjectId: input.subjectId,
      teacherId: input.teacherId ?? null,
      weeklyPeriods: input.weeklyPeriods,
      consecutiveCount: input.consecutiveCount ?? 0,
      consecutiveSize: input.consecutiveSize ?? 2,
      weekMode: input.weekMode ?? 'all',
      mergeGroupId: input.mergeGroupId ?? null,
      fixedRoomId: input.fixedRoomId ?? null
    }
    if (input.id != null) {
      db.prepare(
        `UPDATE teaching_task SET class_id=@classId, subject_id=@subjectId, teacher_id=@teacherId,
           weekly_periods=@weeklyPeriods, consecutive_count=@consecutiveCount,
           consecutive_size=@consecutiveSize, week_mode=@weekMode,
           merge_group_id=@mergeGroupId, fixed_room_id=@fixedRoomId
         WHERE id=@id`
      ).run({ ...params, id: input.id })
      return this.get(input.id) as TeachingTask
    }
    const info = db
      .prepare(
        `INSERT INTO teaching_task
           (semester_id, class_id, subject_id, teacher_id, weekly_periods,
            consecutive_count, consecutive_size, week_mode, merge_group_id, fixed_room_id)
         VALUES (@semesterId, @classId, @subjectId, @teacherId, @weeklyPeriods,
                 @consecutiveCount, @consecutiveSize, @weekMode, @mergeGroupId, @fixedRoomId)
         ON CONFLICT(semester_id, class_id, subject_id, week_mode) DO UPDATE SET
           teacher_id = excluded.teacher_id,
           weekly_periods = excluded.weekly_periods,
           consecutive_count = excluded.consecutive_count,
           consecutive_size = excluded.consecutive_size`
      )
      .run(params)
    if (info.lastInsertRowid) {
      const created = this.get(Number(info.lastInsertRowid))
      if (created) return created
    }
    const row = db
      .prepare(
        'SELECT * FROM teaching_task WHERE semester_id=? AND class_id=? AND subject_id=? AND week_mode=?'
      )
      .get(params.semesterId, params.classId, params.subjectId, params.weekMode) as
      | TaskRow
      | undefined
    return toEntity(row as TaskRow)
  },

  delete(id: number): void {
    getDb().prepare('DELETE FROM teaching_task WHERE id = ?').run(id)
  },

  /**
   * 矩阵编辑器的批量提交（**单事务**）。
   * - `weeklyPeriods === 0` → 删除该 (班, 科) 任务
   * - `weeklyPeriods > 0`   → upsert，仅覆盖传入的字段
   * - `teacherId === undefined` → 保留原教师；`null` → 显式清空
   *
   * 矩阵只操作 week_mode='all' 的常规任务；单双周任务在任务详情弹窗里单独维护。
   */
  applyMatrix(semesterId: number, patches: MatrixCellPatch[]): TeachingTask[] {
    const db = getDb()
    const selectOne = db.prepare(
      `SELECT * FROM teaching_task
        WHERE semester_id=? AND class_id=? AND subject_id=? AND week_mode='all'`
    )
    const del = db.prepare('DELETE FROM teaching_task WHERE id = ?')
    const updPeriods = db.prepare('UPDATE teaching_task SET weekly_periods=? WHERE id=?')
    const updTeacher = db.prepare('UPDATE teaching_task SET teacher_id=? WHERE id=?')
    const ins = db.prepare(
      `INSERT INTO teaching_task
         (semester_id, class_id, subject_id, teacher_id, weekly_periods, week_mode)
       VALUES (?, ?, ?, ?, ?, 'all')`
    )

    const run = db.transaction((list: MatrixCellPatch[]) => {
      for (const p of list) {
        const existing = selectOne.get(semesterId, p.classId, p.subjectId) as TaskRow | undefined
        if (p.weeklyPeriods != null && p.weeklyPeriods <= 0) {
          if (existing) del.run(existing.id)
          continue
        }
        if (!existing) {
          if (p.weeklyPeriods == null || p.weeklyPeriods <= 0) continue
          ins.run(semesterId, p.classId, p.subjectId, p.teacherId ?? null, p.weeklyPeriods)
          continue
        }
        if (p.weeklyPeriods != null && p.weeklyPeriods !== existing.weekly_periods) {
          updPeriods.run(p.weeklyPeriods, existing.id)
        }
        if (p.teacherId !== undefined && p.teacherId !== existing.teacher_id) {
          updTeacher.run(p.teacherId, existing.id)
        }
      }
    })
    run(patches)
    return this.listBySemester(semesterId)
  },

  /** 批量指派教师：把一批 (班, 科) 的任课教师改成同一人（教师指派器的「应用到整列」） */
  assignTeacher(
    semesterId: number,
    cells: { classId: number; subjectId: number }[],
    teacherId: number | null
  ): TeachingTask[] {
    const db = getDb()
    const upd = db.prepare(
      `UPDATE teaching_task SET teacher_id=?
        WHERE semester_id=? AND class_id=? AND subject_id=? AND week_mode='all'`
    )
    const run = db.transaction(() => {
      for (const c of cells) upd.run(teacherId, semesterId, c.classId, c.subjectId)
    })
    run()
    return this.listBySemester(semesterId)
  },

  /** 批量设置连堂（学科规则页用） */
  setConsecutive(
    semesterId: number,
    subjectId: number,
    gradeIds: number[] | undefined,
    consecutiveCount: number,
    consecutiveSize: number
  ): number {
    const db = getDb()
    let sql = `UPDATE teaching_task SET consecutive_count=?, consecutive_size=?
                WHERE semester_id=? AND subject_id=?`
    const args: unknown[] = [consecutiveCount, consecutiveSize, semesterId, subjectId]
    if (gradeIds && gradeIds.length > 0) {
      sql += ` AND class_id IN (SELECT id FROM klass WHERE grade_id IN (${gradeIds
        .map(() => '?')
        .join(',')}))`
      args.push(...gradeIds)
    }
    const info = db.prepare(sql).run(...(args as never[]))
    return info.changes
  },

  /**
   * 套用国家课程标准课时方案。
   * 学科按**名称**匹配 subject 表；匹配不上的名字原样回报，不静默丢弃。
   * `overwrite=false` 时只补空缺，不覆盖已有课时（避免冲掉教务手工调过的数字）。
   */
  applyCurriculum(params: {
    semesterId: number
    planCode: string
    gradeIds: number[]
    overwrite: boolean
    /** 可选：直接传入改过的课时明细，覆盖预设值 */
    entries?: { subject: string; periods: number }[]
  }): CurriculumApplyResult {
    const db = getDb()
    const plan = findPlan(params.planCode)
    const entries = params.entries ?? plan?.entries
    if (!entries) {
      return { created: 0, updated: 0, skippedSubjects: [], affectedClasses: 0 }
    }

    const subjectRows = db.prepare('SELECT id, name FROM subject').all() as {
      id: number
      name: string
    }[]
    const byName = new Map(subjectRows.map((s) => [s.name, s.id]))

    const skipped: string[] = []
    const resolved: { subjectId: number; periods: number }[] = []
    for (const e of entries) {
      const sid = byName.get(e.subject)
      if (sid == null) skipped.push(e.subject)
      else if (e.periods > 0) resolved.push({ subjectId: sid, periods: e.periods })
    }

    if (params.gradeIds.length === 0) {
      return { created: 0, updated: 0, skippedSubjects: skipped, affectedClasses: 0 }
    }
    const classRows = db
      .prepare(
        `SELECT id FROM klass WHERE grade_id IN (${params.gradeIds.map(() => '?').join(',')})
          ORDER BY sort_order, id`
      )
      .all(...params.gradeIds) as { id: number }[]

    const selectOne = db.prepare(
      `SELECT id, weekly_periods FROM teaching_task
        WHERE semester_id=? AND class_id=? AND subject_id=? AND week_mode='all'`
    )
    const upd = db.prepare('UPDATE teaching_task SET weekly_periods=? WHERE id=?')
    const ins = db.prepare(
      `INSERT INTO teaching_task (semester_id, class_id, subject_id, weekly_periods, week_mode)
       VALUES (?, ?, ?, ?, 'all')`
    )

    let created = 0
    let updated = 0
    const run = db.transaction(() => {
      for (const c of classRows) {
        for (const r of resolved) {
          const existing = selectOne.get(params.semesterId, c.id, r.subjectId) as
            | { id: number; weekly_periods: number }
            | undefined
          if (!existing) {
            ins.run(params.semesterId, c.id, r.subjectId, r.periods)
            created += 1
          } else if (params.overwrite && existing.weekly_periods !== r.periods) {
            upd.run(r.periods, existing.id)
            updated += 1
          }
        }
      }
    })
    run()

    return {
      created,
      updated,
      skippedSubjects: skipped,
      affectedClasses: classRows.length
    }
  },

  /** 清空某学期（或某些年级）的全部教学任务 */
  clear(semesterId: number, gradeIds?: number[]): number {
    const db = getDb()
    if (!gradeIds || gradeIds.length === 0) {
      return db.prepare('DELETE FROM teaching_task WHERE semester_id = ?').run(semesterId).changes
    }
    return db
      .prepare(
        `DELETE FROM teaching_task WHERE semester_id = ?
          AND class_id IN (SELECT id FROM klass WHERE grade_id IN (${gradeIds
            .map(() => '?')
            .join(',')}))`
      )
      .run(semesterId, ...gradeIds).changes
  },

  /** 教师工作量看板：已指派周课时 / 上限 / 带班数 */
  workloads(semesterId: number): TeacherWorkload[] {
    const db = getDb()
    const teachers = db
      .prepare('SELECT id, name, max_weekly_periods FROM teacher WHERE enabled = 1 ORDER BY id')
      .all() as { id: number; name: string; max_weekly_periods: number }[]

    const agg = db
      .prepare(
        `SELECT teacher_id, SUM(weekly_periods) AS periods, COUNT(DISTINCT class_id) AS classes
           FROM teaching_task
          WHERE semester_id = ? AND teacher_id IS NOT NULL
          GROUP BY teacher_id`
      )
      .all(semesterId) as { teacher_id: number; periods: number; classes: number }[]
    const aggMap = new Map(agg.map((a) => [a.teacher_id, a]))

    const ts = db.prepare('SELECT teacher_id, subject_id FROM teacher_subject').all() as {
      teacher_id: number
      subject_id: number
    }[]
    const subjMap = new Map<number, number[]>()
    for (const r of ts) {
      const arr = subjMap.get(r.teacher_id) ?? []
      arr.push(r.subject_id)
      subjMap.set(r.teacher_id, arr)
    }

    return teachers.map((t) => {
      const a = aggMap.get(t.id)
      const assigned = a?.periods ?? 0
      return {
        teacherId: t.id,
        name: t.name,
        maxWeeklyPeriods: t.max_weekly_periods,
        assignedPeriods: assigned,
        classCount: a?.classes ?? 0,
        subjectIds: subjMap.get(t.id) ?? [],
        over: assigned > t.max_weekly_periods
      }
    })
  }
}
