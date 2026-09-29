import { describe, expect, it, vi, beforeAll } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * M1 数据层集成测试：跑通「迁移 + 种子 + 全部 Repository」的真实读写。
 *
 * 需要 better-sqlite3 原生模块（.node）已编译。CI / 用户本机满足；
 * 而设计沙箱因网络策略无法下载/编译原生二进制，此时自动 skip（见 PROGRESS.md 风险记录）。
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

const tmpDir = mkdtempSync(join(tmpdir(), 'zhikepai-m1-test-'))
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => tmpDir, getPath: () => tmpDir }
}))

describe.skipIf(!nativeOk)('M1 数据层 · 迁移 + 种子 + Repository', () => {
  type Repos = {
    schoolRepo: (typeof import('./schoolRepo'))['schoolRepo']
    semesterRepo: (typeof import('./semesterRepo'))['semesterRepo']
    stageRepo: (typeof import('./stageRepo'))['stageRepo']
    gradeRepo: (typeof import('./gradeRepo'))['gradeRepo']
    classRepo: (typeof import('./classRepo'))['classRepo']
    subjectRepo: (typeof import('./subjectRepo'))['subjectRepo']
    teacherRepo: (typeof import('./teacherRepo'))['teacherRepo']
    classroomRepo: (typeof import('./classroomRepo'))['classroomRepo']
    weightProfileRepo: (typeof import('./weightProfileRepo'))['weightProfileRepo']
  }
  const r = {} as Repos

  beforeAll(async () => {
    r.schoolRepo = (await import('./schoolRepo')).schoolRepo
    r.semesterRepo = (await import('./semesterRepo')).semesterRepo
    r.stageRepo = (await import('./stageRepo')).stageRepo
    r.gradeRepo = (await import('./gradeRepo')).gradeRepo
    r.classRepo = (await import('./classRepo')).classRepo
    r.subjectRepo = (await import('./subjectRepo')).subjectRepo
    r.teacherRepo = (await import('./teacherRepo')).teacherRepo
    r.classroomRepo = (await import('./classroomRepo')).classroomRepo
    r.weightProfileRepo = (await import('./weightProfileRepo')).weightProfileRepo
  })

  it('内置种子：3 学段、初中 8 节/天、19 学科、3 档权重', () => {
    const stages = r.stageRepo.list()
    expect(stages.map((s) => s.code)).toEqual(['primary', 'junior', 'senior'])

    const junior = stages.find((s) => s.code === 'junior')!
    const juniorSlots = r.stageRepo.listSlots(junior.id)
    expect(juniorSlots.filter((s) => s.dayOfWeek === 1)).toHaveLength(8)
    expect(juniorSlots).toHaveLength(8 * 5)

    expect(r.subjectRepo.list()).toHaveLength(19)

    const profiles = r.weightProfileRepo.list()
    expect(profiles.map((p) => p.code).sort()).toEqual(
      ['balanced', 'student_first', 'teacher_first'].sort()
    )
    const balanced = profiles.find((p) => p.code === 'balanced')!
    expect(balanced.payload.S1).toBe(40)
    expect(Object.keys(balanced.payload)).toHaveLength(15)
  })

  it('学校单例 upsert', () => {
    const saved = r.schoolRepo.save({ name: '示范高完中', schoolType: 'complete' })
    expect(saved.id).toBe(1)
    r.schoolRepo.save({ name: '示范高完中(改)', schoolType: 'complete' })
    expect(r.schoolRepo.get()?.name).toBe('示范高完中(改)')
    expect(r.schoolRepo.get()?.schoolType).toBe('complete')
  })

  it('学期新增/设为当前（唯一当前学期约束）', () => {
    const s1 = r.semesterRepo.upsert({ name: '2026-2027第一学期' })
    expect(r.semesterRepo.getCurrent()?.id).toBe(s1.id) // 首个自动当前
    const s2 = r.semesterRepo.upsert({ name: '2026-2027第二学期' })
    r.semesterRepo.setCurrent(s2.id)
    expect(r.semesterRepo.getCurrent()?.id).toBe(s2.id)
    expect(r.semesterRepo.list().filter((x) => x.isCurrent)).toHaveLength(1)
  })

  it('从零建出 3 年级 × 20 班（M1 验收核心）', () => {
    const sem = r.semesterRepo.getCurrent()!
    const junior = r.stageRepo.list().find((s) => s.code === 'junior')!
    const gradeNames = ['初一', '初二', '初三']
    let total = 0
    for (const name of gradeNames) {
      const g = r.gradeRepo.upsert({ semesterId: sem.id, stageId: junior.id, name })
      const created = r.classRepo.batchCreate({
        gradeId: g.id,
        count: 20,
        namePattern: '{name}({n})班'
      })
      expect(created).toHaveLength(20)
      expect(created[0].name).toBe(`${name}(1)班`)
      expect(created[19].name).toBe(`${name}(20)班`)
      total += created.length
    }
    expect(total).toBe(60)
    expect(r.classRepo.listBySemester(sem.id)).toHaveLength(60)
  })

  it('作息模板覆盖：改为 6 节 × 天数', () => {
    const primary = r.stageRepo.list().find((s) => s.code === 'primary')!
    const slots = r.stageRepo.replaceSlots(primary.id, [
      {
        periodIndex: 1,
        periodName: '第1节',
        segment: 'morning',
        startTime: '08:00',
        endTime: '08:40'
      },
      { periodIndex: 2, periodName: '第2节', segment: 'morning' },
      { periodIndex: 3, periodName: '第3节', segment: 'morning' },
      { periodIndex: 4, periodName: '第4节', segment: 'afternoon' },
      { periodIndex: 5, periodName: '第5节', segment: 'afternoon' },
      { periodIndex: 6, periodName: '第6节', segment: 'afternoon' }
    ])
    expect(slots).toHaveLength(6 * primary.daysPerWeek)
  })

  it('教师一师多科 + 教室双容量', () => {
    const subjects = r.subjectRepo.list()
    const chinese = subjects.find((s) => s.name === '语文')!
    const math = subjects.find((s) => s.name === '数学')!
    const t = r.teacherRepo.upsert({
      name: '张老师',
      maxWeeklyPeriods: 16,
      subjectIds: [chinese.id, math.id]
    })
    expect(new Set(r.teacherRepo.get(t.id)!.subjectIds)).toEqual(new Set([chinese.id, math.id]))
    // 改为只教语文
    r.teacherRepo.upsert({ id: t.id, name: '张老师', subjectIds: [chinese.id] })
    expect(r.teacherRepo.get(t.id)!.subjectIds).toEqual([chinese.id])

    const field = r.classroomRepo.upsert({
      name: '田径场',
      roomType: 'sports',
      capacity: 800,
      concurrentCapacity: 4
    })
    expect(r.classroomRepo.get(field.id)).toMatchObject({ capacity: 800, concurrentCapacity: 4 })
  })
})
