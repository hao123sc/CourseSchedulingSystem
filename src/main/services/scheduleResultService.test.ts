import { describe, expect, it, vi, beforeAll } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * M3 后半段 · 排课结果落库集成测试：
 * solve() 的输出 → 事务写入 schedule_version + lesson，口径逐条核对：
 * 连堂组共享 consecutive_group、预排锁定 is_locked=1、年级级与无学科占位的处理、
 * 拼合组逐班场地、外键失败整体回滚。
 *
 * 同 M1/M2：需要 better-sqlite3 原生模块，沙箱里自动 skip（npm run test:sqlite 可真跑）。
 */
const require = createRequire(import.meta.url)
let nativeOk = false
try {
  const Database = require('better-sqlite3')
  const probe = new Database(':memory:')
  probe.close()
  nativeOk = true
} catch {
  nativeOk = false
}

const tmpDir = mkdtempSync(join(tmpdir(), 'zhikepai-schedule-test-'))
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => tmpDir, getPath: () => tmpDir }
}))

describe.skipIf(!nativeOk)('M3 · 排课结果落库', () => {
  type Ctx = {
    getDb: (typeof import('../db/connection'))['getDb']
    buildSolverInput: (typeof import('./solverInputService'))['buildSolverInput']
    saveSchedule: (typeof import('./scheduleResultService'))['saveSchedule']
    listVersions: (typeof import('./scheduleResultService'))['listVersions']
    deleteVersion: (typeof import('./scheduleResultService'))['deleteVersion']
    getVersionLessons: (typeof import('./scheduleResultService'))['getVersionLessons']
    adjustLessonSlot: (typeof import('./scheduleResultService'))['adjustLessonSlot']
    solve: (typeof import('@solver/solve'))['solve']
  }
  const r = {} as Ctx
  const ids = {
    semesterId: 0,
    stageId: 0,
    gradeId: 0,
    classIds: [] as number[],
    roomIds: [] as number[],
    teacherIds: [] as number[],
    chineseTaskId: 0,
    slotMon1: 0,
    slotMon2: 0
  }

  beforeAll(async () => {
    r.getDb = (await import('../db/connection')).getDb
    r.buildSolverInput = (await import('./solverInputService')).buildSolverInput
    const svc = await import('./scheduleResultService')
    r.saveSchedule = svc.saveSchedule
    r.listVersions = svc.listVersions
    r.deleteVersion = svc.deleteVersion
    r.getVersionLessons = svc.getVersionLessons
    r.adjustLessonSlot = svc.adjustLessonSlot
    r.solve = (await import('@solver/solve')).solve

    const db = r.getDb()
    const run = db.prepare.bind(db)

    // ── 最小种子：初中部 1 个年级 2 个班 ──
    ids.semesterId = Number(
      run(`INSERT INTO semester (name, is_current) VALUES ('2026-2027学年第一学期', 1)`).run()
        .lastInsertRowid
    )
    ids.stageId = (run('SELECT id FROM stage WHERE code = ?').get('junior') as { id: number }).id
    ids.gradeId = Number(
      run(
        `INSERT INTO grade (semester_id, stage_id, name, sort_order) VALUES (?, ?, '初一', 1)`
      ).run(ids.semesterId, ids.stageId).lastInsertRowid
    )
    for (let i = 1; i <= 2; i++) {
      const rid = Number(
        run(
          `INSERT INTO classroom (name, room_type, capacity, concurrent_capacity) VALUES (?, 'normal', 50, 1)`
        ).run(`教室${i}`).lastInsertRowid
      )
      ids.roomIds.push(rid)
      ids.classIds.push(
        Number(
          run(
            `INSERT INTO klass (grade_id, name, student_count, home_room_id, sort_order) VALUES (?, ?, 45, ?, ?)`
          ).run(ids.gradeId, `初一(${i})班`, rid, i).lastInsertRowid
        )
      )
    }
    for (let i = 1; i <= 2; i++) {
      ids.teacherIds.push(
        Number(
          run(`INSERT INTO teacher (name, staff_no, max_weekly_periods) VALUES (?, ?, 20)`).run(
            `老师${i}`,
            `T00${i}`
          ).lastInsertRowid
        )
      )
    }
    const chinese = run('SELECT id FROM subject WHERE name = ?').get('语文') as { id: number }
    const math = run('SELECT id FROM subject WHERE name = ?').get('数学') as { id: number }
    const pe = run('SELECT id FROM subject WHERE name = ?').get('体育') as { id: number }
    ids.chineseTaskId = Number(
      run(
        `INSERT INTO teaching_task (semester_id, class_id, subject_id, teacher_id, weekly_periods, consecutive_count, consecutive_size)
         VALUES (?, ?, ?, ?, 4, 1, 2)`
      ).run(ids.semesterId, ids.classIds[0], chinese.id, ids.teacherIds[0]).lastInsertRowid
    )
    run(
      `INSERT INTO teaching_task (semester_id, class_id, subject_id, teacher_id, weekly_periods)
       VALUES (?, ?, ?, ?, 3)`
    ).run(ids.semesterId, ids.classIds[0], math.id, ids.teacherIds[1])
    run(
      `INSERT INTO teaching_task (semester_id, class_id, subject_id, teacher_id, weekly_periods)
       VALUES (?, ?, ?, ?, 2)`
    ).run(ids.semesterId, ids.classIds[1], chinese.id, ids.teacherIds[0])
    run(
      `INSERT INTO teaching_task (semester_id, class_id, subject_id, teacher_id, weekly_periods)
       VALUES (?, ?, ?, ?, 2)`
    ).run(ids.semesterId, ids.classIds[1], math.id, ids.teacherIds[1])
    // 体育只在 2 班开课：1 班的体育预排才是「钉了一节不存在的课」
    run(
      `INSERT INTO teaching_task (semester_id, class_id, subject_id, teacher_id, weekly_periods)
       VALUES (?, ?, ?, ?, 2)`
    ).run(ids.semesterId, ids.classIds[1], pe.id, ids.teacherIds[1])
    // 体育要专用场地（need_special_room=1）：补一块操场并绑定
    const playground = Number(
      run(
        `INSERT INTO classroom (name, room_type, capacity, concurrent_capacity) VALUES ('操场', 'sports', 300, 2)`
      ).run().lastInsertRowid
    )
    run(`INSERT INTO subject_classroom (subject_id, classroom_id) VALUES (?, ?)`).run(
      pe.id,
      playground
    )

    // 时段：初中周一第 1、2 节（升旗位 = 第 1 节）
    const slotRows = run(
      `SELECT id, period_index FROM time_slot WHERE stage_id = ? AND day_of_week = 1 ORDER BY period_index LIMIT 2`
    ).all(ids.stageId) as { id: number; period_index: number }[]
    ids.slotMon1 = slotRows[0].id
    ids.slotMon2 = slotRows[1].id

    // ── 预排锁定：四种形态各一条 ──
    // ① 班级级 + 带学科（钉死一节语文在周一第 2 节）→ 应落库为 is_locked=1 的课
    run(
      `INSERT INTO fixed_lesson (semester_id, class_id, grade_id, subject_id, teacher_id, classroom_id, slot_id, kind, label)
       VALUES (?, ?, NULL, ?, ?, NULL, ?, 'lesson', '钉死的语文')`
    ).run(ids.semesterId, ids.classIds[0], chinese.id, ids.teacherIds[0], ids.slotMon2)
    // ② 年级级 + 无学科（升旗）→ 不产生课，只占位
    run(
      `INSERT INTO fixed_lesson (semester_id, class_id, grade_id, subject_id, teacher_id, classroom_id, slot_id, kind, label)
       VALUES (?, NULL, ?, NULL, NULL, NULL, ?, 'lesson', '升旗仪式')`
    ).run(ids.semesterId, ids.gradeId, ids.slotMon1)
    // ③ 带学科但该班没有这门课的教学任务（体育）→ 跳过并计数
    run(
      `INSERT INTO fixed_lesson (semester_id, class_id, grade_id, subject_id, teacher_id, classroom_id, slot_id, kind, label)
       VALUES (?, ?, NULL, ?, NULL, NULL, ?, 'lesson', '无任务学科')`
    ).run(ids.semesterId, ids.classIds[0], pe.id, ids.slotMon1)
    // ④ block 仅占用（教室维护）→ 不产生课
    run(
      `INSERT INTO fixed_lesson (semester_id, class_id, grade_id, subject_id, teacher_id, classroom_id, slot_id, kind, label)
       VALUES (?, NULL, NULL, NULL, NULL, ?, ?, 'block', '教室维护')`
    ).run(ids.semesterId, ids.roomIds[0], ids.slotMon2)
  })

  it('端到端：solve → saveSchedule，行数与口径逐条对上', () => {
    const input = r.buildSolverInput(ids.semesterId)
    const result = r.solve(input)
    expect(result.status).toBe('solved')
    expect(result.violations).toEqual([])

    const saved = r.saveSchedule({
      semesterId: ids.semesterId,
      weightProfileCode: 'balanced',
      solveMs: result.stats.elapsedMs,
      hardViolations: result.violations.length,
      metrics: { ...result.stats },
      lessons: result.lessons
    })

    // 版本行
    expect(saved.name).toBe('自动排课 #1 · 均衡')
    expect(saved.lessonCount).toBe(result.lessons.length)
    expect(saved.lockedCount).toBe(1) // 只有①：钉死的语文
    expect(saved.skippedFixed).toBe(1) // ③：体育没有教学任务

    const rows = r.getVersionLessons(saved.versionId)
    expect(rows.length).toBe(saved.lessonCount + saved.lockedCount)

    // 语文连堂（1×2）共享 consecutive_group，单节课为 null
    const chineseBlock = rows.filter(
      (x) => x.taskId === ids.chineseTaskId && x.consecutiveGroup != null
    )
    expect(chineseBlock.length).toBe(2)
    expect(new Set(chineseBlock.map((x) => x.consecutiveGroup)).size).toBe(1)
    for (const x of rows.filter((y) => y.taskId !== ids.chineseTaskId)) {
      if (x.isLocked) continue
      expect(x.consecutiveGroup).toBeNull()
    }

    // 预排锁定行：is_locked=1、remark 带 label、课时守恒（语文 4 = 排出 3 + 锁定 1）
    const locked = rows.filter((x) => x.isLocked)
    expect(locked.length).toBe(1)
    expect(locked[0].remark).toBe('钉死的语文')
    expect(locked[0].slotId).toBe(ids.slotMon2)
    const chinesePlaced = rows.filter((x) => x.taskId === ids.chineseTaskId).length
    expect(chinesePlaced).toBe(4)

    // 逐班场地：两个班各有固定教室，绝不能把第一班的场地套给第二班
    const byClass = new Map(rows.filter((x) => !x.isLocked).map((x) => [x.classId, x]))
    expect(byClass.get(ids.classIds[0])!.classroomId).toBe(ids.roomIds[0])
    expect(byClass.get(ids.classIds[1])!.classroomId).toBe(ids.roomIds[1])

    // listVersions 聚合
    const versions = r.listVersions(ids.semesterId)
    expect(versions.length).toBe(1)
    expect(versions[0].lessonCount).toBe(rows.length)
    expect(versions[0].hardViolations).toBe(0)
    expect(versions[0].metrics).toBeTruthy()
    expect((versions[0].metrics as Record<string, unknown>)['accidentalBlocks']).toBe(0)
  })

  it('M6：合法换课在事务内更新 lesson 并写入调整日志', () => {
    const version = r.listVersions(ids.semesterId)[0]
    const lesson = r.getVersionLessons(version.id).find((item) => !item.isLocked)!
    const beforeLogs = (r.getDb().prepare('SELECT COUNT(*) AS n FROM adjust_log WHERE version_id = ?').get(version.id) as { n: number }).n

    const updated = r.adjustLessonSlot({
      versionId: version.id,
      lessonId: lesson.id,
      toSlotId: ids.slotMon1,
      reason: '测试持久化'
    })

    expect(updated.slotId).toBe(ids.slotMon1)
    expect(r.getVersionLessons(version.id).find((item) => item.id === lesson.id)!.slotId).toBe(ids.slotMon1)
    const log = r.getDb().prepare(
      'SELECT action, before_json, after_json, reason FROM adjust_log WHERE version_id = ? ORDER BY id DESC LIMIT 1'
    ).get(version.id) as { action: string; before_json: string; after_json: string; reason: string }
    expect(log.action).toBe('move')
    expect(JSON.parse(log.before_json)).toEqual({ lessonId: lesson.id, slotId: lesson.slotId })
    expect(JSON.parse(log.after_json)).toEqual({ lessonId: lesson.id, slotId: ids.slotMon1 })
    expect(log.reason).toBe('测试持久化')
    expect((r.getDb().prepare('SELECT COUNT(*) AS n FROM adjust_log WHERE version_id = ?').get(version.id) as { n: number }).n).toBe(beforeLogs + 1)
  })

  it('M6：版本归属、锁定课程和目标时段校验失败时不写调整日志', () => {
    const version = r.listVersions(ids.semesterId)[0]
    const locked = r.getVersionLessons(version.id).find((item) => item.isLocked)!
    const movable = r.getVersionLessons(version.id).find((item) => !item.isLocked)!
    const count = (r.getDb().prepare('SELECT COUNT(*) AS n FROM adjust_log WHERE version_id = ?').get(version.id) as { n: number }).n

    expect(() => r.adjustLessonSlot({ versionId: version.id, lessonId: locked.id, toSlotId: ids.slotMon1 })).toThrow('预排锁定课程不可移动')
    expect(() => r.adjustLessonSlot({ versionId: version.id + 999, lessonId: movable.id, toSlotId: ids.slotMon1 })).toThrow('课程不属于当前课表版本')
    expect(() => r.adjustLessonSlot({ versionId: version.id, lessonId: movable.id, toSlotId: 999999 })).toThrow('目标时段不存在')
    expect((r.getDb().prepare('SELECT COUNT(*) AS n FROM adjust_log WHERE version_id = ?').get(version.id) as { n: number }).n).toBe(count)
  })

  it('外键失败整体回滚：不留半个版本', () => {
    const before = r.listVersions(ids.semesterId).length
    expect(() =>
      r.saveSchedule({
        semesterId: ids.semesterId,
        weightProfileCode: 'balanced',
        solveMs: 1,
        hardViolations: 0,
        lessons: [
          {
            unitId: 0,
            taskId: 999999, // 不存在的任务 → 外键拦截
            classId: ids.classIds[0],
            subjectId: 1,
            teacherId: null,
            classroomId: null,
            slotId: ids.slotMon1,
            weekMode: 'all',
            blockIndex: 0,
            blockSize: 1
          }
        ]
      })
    ).toThrow()
    expect(r.listVersions(ids.semesterId).length).toBe(before)
  })

  it('删除版本会级联清掉课表行', () => {
    const v = r.listVersions(ids.semesterId)[0]
    r.deleteVersion(v.id)
    expect(r.listVersions(ids.semesterId)).toEqual([])
    expect(r.getVersionLessons(v.id)).toEqual([])
  })
})
