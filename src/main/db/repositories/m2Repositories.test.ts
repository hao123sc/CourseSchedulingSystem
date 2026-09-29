import { describe, expect, it, vi, beforeAll } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * M2 集成测试：教学任务矩阵 / 四层时段规则 / 学科规则 / 预排锁定 / 约束组
 * + 「数据可完整读出为 SolverInput」的端到端验收。
 *
 * 同 M1：需要 better-sqlite3 原生模块。设计沙箱因网络策略无法编译原生二进制，
 * 此时自动 skip；CI / 用户本机会实际运行（见 PROGRESS.md 风险记录）。
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

const tmpDir = mkdtempSync(join(tmpdir(), 'zhikepai-m2-test-'))
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => tmpDir, getPath: () => tmpDir }
}))

describe.skipIf(!nativeOk)('M2 · 教学任务与规则数据层', () => {
  type Ctx = {
    semesterRepo: (typeof import('./semesterRepo'))['semesterRepo']
    stageRepo: (typeof import('./stageRepo'))['stageRepo']
    gradeRepo: (typeof import('./gradeRepo'))['gradeRepo']
    classRepo: (typeof import('./classRepo'))['classRepo']
    subjectRepo: (typeof import('./subjectRepo'))['subjectRepo']
    teacherRepo: (typeof import('./teacherRepo'))['teacherRepo']
    classroomRepo: (typeof import('./classroomRepo'))['classroomRepo']
    taskRepo: (typeof import('./teachingTaskRepo'))['teachingTaskRepo']
    ruleRepo: (typeof import('./timeRuleRepo'))['timeRuleRepo']
    subjectRuleRepo: (typeof import('./subjectRuleRepo'))['subjectRuleRepo']
    fixedRepo: (typeof import('./fixedLessonRepo'))['fixedLessonRepo']
    groupRepo: (typeof import('./constraintGroupRepo'))['constraintGroupRepo']
    buildSolverInput: (typeof import('../../services/solverInputService'))['buildSolverInput']
    checkSolverInput: (typeof import('../../services/solverInputService'))['checkSolverInput']
  }
  const r = {} as Ctx
  const ids = {
    semesterId: 0,
    stageId: 0,
    gradeIds: [] as number[],
    classIds: [] as number[],
    chinese: 0,
    pe: 0,
    teacherIds: [] as number[],
    trackId: 0,
    slotIds: [] as number[]
  }

  beforeAll(async () => {
    r.semesterRepo = (await import('./semesterRepo')).semesterRepo
    r.stageRepo = (await import('./stageRepo')).stageRepo
    r.gradeRepo = (await import('./gradeRepo')).gradeRepo
    r.classRepo = (await import('./classRepo')).classRepo
    r.subjectRepo = (await import('./subjectRepo')).subjectRepo
    r.teacherRepo = (await import('./teacherRepo')).teacherRepo
    r.classroomRepo = (await import('./classroomRepo')).classroomRepo
    r.taskRepo = (await import('./teachingTaskRepo')).teachingTaskRepo
    r.ruleRepo = (await import('./timeRuleRepo')).timeRuleRepo
    r.subjectRuleRepo = (await import('./subjectRuleRepo')).subjectRuleRepo
    r.fixedRepo = (await import('./fixedLessonRepo')).fixedLessonRepo
    r.groupRepo = (await import('./constraintGroupRepo')).constraintGroupRepo
    const svc = await import('../../services/solverInputService')
    r.buildSolverInput = svc.buildSolverInput
    r.checkSolverInput = svc.checkSolverInput

    // ── 构造一所「示范初中」：3 年级 × 4 班 ──
    const sem = r.semesterRepo.upsert({ name: '2026-2027学年第一学期' })
    r.semesterRepo.setCurrent(sem.id)
    ids.semesterId = sem.id
    const junior = r.stageRepo.list().find((s) => s.code === 'junior')!
    ids.stageId = junior.id
    ids.slotIds = r.stageRepo.listSlots(junior.id).map((s) => s.id)

    for (const name of ['初一', '初二', '初三']) {
      const g = r.gradeRepo.upsert({ semesterId: sem.id, stageId: junior.id, name })
      ids.gradeIds.push(g.id)
      const created = r.classRepo.batchCreate({
        gradeId: g.id,
        count: 4,
        namePattern: '{name}({n})班'
      })
      ids.classIds.push(...created.map((c) => c.id))
    }

    const subjects = r.subjectRepo.list()
    ids.chinese = subjects.find((s) => s.name === '语文')!.id
    ids.pe = subjects.find((s) => s.name === '体育')!.id

    for (let i = 1; i <= 12; i++) {
      const t = r.teacherRepo.upsert({
        name: `教师${i}`,
        maxWeeklyPeriods: 18,
        subjectIds: [i <= 8 ? ids.chinese : ids.pe]
      })
      ids.teacherIds.push(t.id)
    }
    ids.trackId = r.classroomRepo.upsert({
      name: '田径场',
      roomType: 'sports',
      capacity: 800,
      concurrentCapacity: 4
    }).id
  })

  // ── 1. 教学任务矩阵 ────────────────────────────────────────────────
  it('applyMatrix：新增 / 改课时 / 删除 / 保留教师，全在一个事务里', () => {
    const [c1, c2] = ids.classIds
    r.taskRepo.applyMatrix(ids.semesterId, [
      { classId: c1, subjectId: ids.chinese, weeklyPeriods: 5 },
      { classId: c2, subjectId: ids.chinese, weeklyPeriods: 5 }
    ])
    let tasks = r.taskRepo.listBySemester(ids.semesterId)
    expect(tasks).toHaveLength(2)

    // 指派教师后只改课时，教师必须保留
    r.taskRepo.applyMatrix(ids.semesterId, [
      { classId: c1, subjectId: ids.chinese, teacherId: ids.teacherIds[0] }
    ])
    r.taskRepo.applyMatrix(ids.semesterId, [
      { classId: c1, subjectId: ids.chinese, weeklyPeriods: 6 }
    ])
    tasks = r.taskRepo.listBySemester(ids.semesterId)
    const t1 = tasks.find((t) => t.classId === c1)!
    expect(t1.weeklyPeriods).toBe(6)
    expect(t1.teacherId).toBe(ids.teacherIds[0])

    // 课时置 0 = 删除
    r.taskRepo.applyMatrix(ids.semesterId, [
      { classId: c2, subjectId: ids.chinese, weeklyPeriods: 0 }
    ])
    expect(r.taskRepo.listBySemester(ids.semesterId)).toHaveLength(1)
  })

  it('课时方案一键套用：按学科名匹配，未匹配的如实回报', () => {
    r.taskRepo.clear(ids.semesterId)
    const res = r.taskRepo.applyCurriculum({
      semesterId: ids.semesterId,
      planCode: 'junior_g7',
      gradeIds: [ids.gradeIds[0]],
      overwrite: true
    })
    expect(res.affectedClasses).toBe(4)
    expect(res.skippedSubjects).toEqual([])
    expect(res.created).toBeGreaterThan(0)

    const tasks = r.taskRepo.listBySemester(ids.semesterId)
    const perClass = tasks.filter((t) => t.classId === ids.classIds[0])
    expect(perClass.find((t) => t.subjectId === ids.chinese)?.weeklyPeriods).toBe(5)

    // overwrite=false 不覆盖手工改过的数字
    r.taskRepo.applyMatrix(ids.semesterId, [
      { classId: ids.classIds[0], subjectId: ids.chinese, weeklyPeriods: 9 }
    ])
    r.taskRepo.applyCurriculum({
      semesterId: ids.semesterId,
      planCode: 'junior_g7',
      gradeIds: [ids.gradeIds[0]],
      overwrite: false
    })
    expect(
      r.taskRepo
        .listBySemester(ids.semesterId)
        .find((t) => t.classId === ids.classIds[0] && t.subjectId === ids.chinese)?.weeklyPeriods
    ).toBe(9)

    // 自定义 entries 覆盖预设值
    const res2 = r.taskRepo.applyCurriculum({
      semesterId: ids.semesterId,
      planCode: 'junior_g7',
      gradeIds: [ids.gradeIds[0]],
      overwrite: true,
      entries: [
        { subject: '语文', periods: 4 },
        { subject: '不存在的学科', periods: 2 }
      ]
    })
    expect(res2.skippedSubjects).toEqual(['不存在的学科'])
    expect(
      r.taskRepo
        .listBySemester(ids.semesterId)
        .find((t) => t.classId === ids.classIds[0] && t.subjectId === ids.chinese)?.weeklyPeriods
    ).toBe(4)
  })

  it('批量指派教师 + 工作量看板超限判定', () => {
    const cells = ids.classIds
      .slice(0, 4)
      .map((classId) => ({ classId, subjectId: ids.chinese }))
    r.taskRepo.assignTeacher(ids.semesterId, cells, ids.teacherIds[0])
    const assigned = r.taskRepo
      .listBySemester(ids.semesterId)
      .filter((t) => t.subjectId === ids.chinese && t.teacherId === ids.teacherIds[0])
    expect(assigned).toHaveLength(4)

    const w = r.taskRepo.workloads(ids.semesterId).find((x) => x.teacherId === ids.teacherIds[0])!
    expect(w.classCount).toBe(4)
    expect(w.assignedPeriods).toBe(assigned.reduce((s, t) => s + t.weeklyPeriods, 0))
    expect(w.over).toBe(w.assignedPeriods > w.maxWeeklyPeriods)

    // 清除指派
    r.taskRepo.assignTeacher(ids.semesterId, cells, null)
    expect(
      r.taskRepo.workloads(ids.semesterId).find((x) => x.teacherId === ids.teacherIds[0])!
        .assignedPeriods
    ).toBe(0)
  })

  // ── 2. 四层时段规则 ───────────────────────────────────────────────
  it('时段规则 setCells：NORMAL 视为删除，不写垃圾行', () => {
    const scope = { scopeType: 'teacher' as const, scopeId: ids.teacherIds[0] }
    r.ruleRepo.setCells(
      ids.semesterId,
      scope,
      ids.slotIds.slice(0, 5).map((slotId) => ({ slotId, ruleValue: 'FORBIDDEN' as const }))
    )
    expect(r.ruleRepo.listByScope(ids.semesterId, scope)).toHaveLength(5)

    r.ruleRepo.setCells(ids.semesterId, scope, [
      { slotId: ids.slotIds[0], ruleValue: 'NORMAL' }
    ])
    expect(r.ruleRepo.listByScope(ids.semesterId, scope)).toHaveLength(4)

    // 同一格重刷不会产生重复行
    r.ruleRepo.setCells(ids.semesterId, scope, [
      { slotId: ids.slotIds[1], ruleValue: 'AVOID' },
      { slotId: ids.slotIds[1], ruleValue: 'PREFERRED' }
    ])
    const rows = r.ruleRepo.listByScope(ids.semesterId, scope)
    expect(rows.filter((x) => x.slotId === ids.slotIds[1])).toHaveLength(1)
    expect(rows.find((x) => x.slotId === ids.slotIds[1])?.ruleValue).toBe('PREFERRED')
  })

  it('global 作用域（scope_id 为 NULL）也能正确读写与去重', () => {
    const g = { scopeType: 'global' as const, scopeId: null }
    r.ruleRepo.setCells(ids.semesterId, g, [{ slotId: ids.slotIds[10], ruleValue: 'FORBIDDEN' }])
    r.ruleRepo.setCells(ids.semesterId, g, [{ slotId: ids.slotIds[10], ruleValue: 'AVOID' }])
    const rows = r.ruleRepo.listByScope(ids.semesterId, g)
    expect(rows).toHaveLength(1)
    expect(rows[0].ruleValue).toBe('AVOID')
    expect(rows[0].scopeId).toBeNull()
  })

  it('copyScope 应用到同学科教师 + summary 统计', () => {
    const from = { scopeType: 'teacher' as const, scopeId: ids.teacherIds[0] }
    const targets = ids.teacherIds
      .slice(1, 4)
      .map((id) => ({ scopeType: 'teacher' as const, scopeId: id }))
    const n = r.ruleRepo.copyScope(ids.semesterId, from, targets)
    const source = r.ruleRepo.listByScope(ids.semesterId, from)
    expect(n).toBe(source.length * targets.length)
    for (const t of targets) {
      expect(r.ruleRepo.listByScope(ids.semesterId, t)).toHaveLength(source.length)
    }

    const summary = r.ruleRepo.summary(ids.semesterId)
    const mine = summary.find(
      (s) => s.scopeType === 'teacher' && s.scopeId === ids.teacherIds[0]
    )!
    expect(mine.ruleCount).toBe(source.length)
    expect(mine.forbiddenCount + mine.avoidCount + mine.preferredCount).toBe(source.length)

    const cleared = r.ruleRepo.clearScope(ids.semesterId, targets[0])
    expect(cleared).toBe(source.length)
    expect(r.ruleRepo.listByScope(ids.semesterId, targets[0])).toHaveLength(0)
  })

  // ── 3. 学科规则 ───────────────────────────────────────────────────
  it('学科规则保存 + 专用场地绑定 + 连堂批量下发', () => {
    r.subjectRuleRepo.saveRules([
      {
        subjectId: ids.chinese,
        dailyMax: 2,
        weekSpread: 'spread',
        importance: 5,
        needSpecialRoom: false
      },
      { subjectId: ids.pe, dailyMax: 1, weekSpread: 'spread', importance: 2, needSpecialRoom: true }
    ])
    const pe = r.subjectRepo.list().find((s) => s.id === ids.pe)!
    expect(pe.dailyMax).toBe(1)
    expect(pe.needSpecialRoom).toBe(true)

    r.subjectRuleRepo.setClassrooms(ids.pe, [
      { classroomId: ids.trackId, slotsTaken: 1, priority: 5 }
    ])
    const binds = r.subjectRuleRepo.listClassrooms().filter((b) => b.subjectId === ids.pe)
    expect(binds).toHaveLength(1)
    expect(binds[0].priority).toBe(5)

    // 覆盖式写入：再设一次只剩新的
    r.subjectRuleRepo.setClassrooms(ids.pe, [
      { classroomId: ids.trackId, slotsTaken: 2, priority: 1 }
    ])
    expect(
      r.subjectRuleRepo.listClassrooms().filter((b) => b.subjectId === ids.pe)[0].slotsTaken
    ).toBe(2)

    const changed = r.taskRepo.setConsecutive(ids.semesterId, ids.chinese, [ids.gradeIds[0]], 1, 2)
    expect(changed).toBeGreaterThan(0)
    const t = r.taskRepo
      .listBySemester(ids.semesterId)
      .find((x) => x.classId === ids.classIds[0] && x.subjectId === ids.chinese)!
    expect(t.consecutiveCount).toBe(1)
    expect(t.consecutiveSize).toBe(2)
  })

  // ── 4. 预排锁定 ───────────────────────────────────────────────────
  it('预排锁定批量创建 + 冲突体检（逻辑来自 shared/constraints）', () => {
    const slot = ids.slotIds[0]
    r.fixedRepo.bulkCreate(
      ids.gradeIds.map((gradeId) => ({
        semesterId: ids.semesterId,
        gradeId,
        slotId: slot,
        label: '升旗仪式'
      }))
    )
    expect(r.fixedRepo.listBySemester(ids.semesterId)).toHaveLength(3)
    expect(r.fixedRepo.conflicts(ids.semesterId)).toHaveLength(0)

    // 给已被年级占位的班再加一条 → 必须报冲突
    const dup = r.fixedRepo.upsert({
      semesterId: ids.semesterId,
      classId: ids.classIds[0],
      slotId: slot,
      label: '重复占位'
    })
    const conflicts = r.fixedRepo.conflicts(ids.semesterId)
    expect(conflicts.some((c) => c.kind === 'class')).toBe(true)
    r.fixedRepo.delete(dup.id)
    expect(r.fixedRepo.conflicts(ids.semesterId)).toHaveLength(0)
  })

  // ── 5. 约束组 ─────────────────────────────────────────────────────
  it('约束组 CRUD：成员覆盖写入 + 删除级联', () => {
    const g = r.groupRepo.upsert({
      semesterId: ids.semesterId,
      groupType: 'teacher_mutex',
      name: '跨校兼课互斥',
      hardness: 'hard',
      members: [
        { memberType: 'teacher', memberId: ids.teacherIds[0] },
        { memberType: 'teacher', memberId: ids.teacherIds[1] }
      ]
    })
    expect(g.members).toHaveLength(2)

    const updated = r.groupRepo.upsert({
      id: g.id,
      semesterId: ids.semesterId,
      groupType: 'teacher_mutex',
      name: '跨校兼课互斥(改)',
      hardness: 'soft',
      maxConcurrent: 1,
      members: [{ memberType: 'teacher', memberId: ids.teacherIds[2] }]
    })
    expect(updated.name).toBe('跨校兼课互斥(改)')
    expect(updated.hardness).toBe('soft')
    expect(updated.members).toEqual([{ memberType: 'teacher', memberId: ids.teacherIds[2] }])

    r.groupRepo.delete(g.id)
    expect(r.groupRepo.listBySemester(ids.semesterId).find((x) => x.id === g.id)).toBeUndefined()
  })

  // ── 6. M2 验收：完整读出 SolverInput ───────────────────────────────
  it('SolverInput 能完整读出全部 M2 数据', () => {
    const input = r.buildSolverInput(ids.semesterId)
    expect(input.semesterId).toBe(ids.semesterId)
    expect(input.weights.S1).toBe(40)
    expect(input.classes).toHaveLength(12)
    expect(input.grades).toHaveLength(3)
    expect(input.grades[0].classIds).toHaveLength(4)
    expect(input.stages.find((s) => s.code === 'junior')!.slotIds).toHaveLength(40)
    expect(input.tasks.length).toBeGreaterThan(0)
    expect(input.timeRules.length).toBeGreaterThan(0)
    expect(input.fixedLessons).toHaveLength(3)

    // 学科专用场地绑定被带进快照
    const pe = input.subjects.find((s) => s.id === ids.pe)!
    expect(pe.allowedRooms).toEqual([{ classroomId: ids.trackId, slotsTaken: 2, priority: 1 }])

    // 田径场并发容量正确
    expect(input.rooms.find((r2) => r2.id === ids.trackId)!.concurrentCapacity).toBe(4)

    // 教师任教学科关系带出
    expect(input.teachers.find((t) => t.id === ids.teacherIds[0])!.subjectIds).toEqual([
      ids.chinese
    ])
  })

  it('checkSolverInput 能发现未指派教师，配齐后通过', () => {
    const before = r.checkSolverInput(ids.semesterId)
    expect(before.stats.unassignedTasks).toBeGreaterThan(0)
    expect(before.issues.some((i) => i.code === 'TASK_NO_TEACHER')).toBe(true)

    // 为初一 4 个班配齐教师（语文 1 人带 4 班，其余每科轮转）
    const tasks = r.taskRepo.listBySemester(ids.semesterId)
    const bySubject = new Map<number, number>()
    for (const t of tasks) {
      if (!bySubject.has(t.subjectId)) {
        bySubject.set(t.subjectId, bySubject.size)
      }
    }
    // 给每条任务造一位专属教师，确保不超工作量
    for (const t of tasks) {
      const teacher = r.teacherRepo.upsert({
        name: `专任${t.id}`,
        maxWeeklyPeriods: 40,
        subjectIds: [t.subjectId]
      })
      r.taskRepo.upsert({ ...t, teacherId: teacher.id })
    }
    const after = r.checkSolverInput(ids.semesterId)
    expect(after.stats.unassignedTasks).toBe(0)
    expect(after.issues.filter((i) => i.code === 'TASK_NO_TEACHER')).toHaveLength(0)
  })
})
