import { describe, expect, it, vi, beforeAll } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  ScheduleEventPayload,
  ScheduleProgressPayload,
  ScheduleDonePayload
} from '@shared/types/ipc'
import type { SolveRequest, SolveSummary, WorkerMessage } from '../solver/protocol'
import type { WorkerSpawner } from './solverRunService'

/**
 * M3 后半段 · 排课执行编排（多起点 worker 池）测试。
 *
 * 用可注入的假 spawner 替代真实 worker_threads（走同一套消息协议、真跑真 solve()），
 * 验证：进度汇总、多起点择优、取消（terminate + cancelled 事件、不落库）、
 * infeasible 不建版本、并发互斥、成功路径真实落库。
 * 真实 worker 线程链路（esbuild 产物 + worker_threads）由 preview:ui 浏览器预览
 * 与用户真机覆盖。
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

const tmpDir = mkdtempSync(join(tmpdir(), 'zhikepai-run-test-'))
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => tmpDir, getPath: () => tmpDir }
}))

describe.skipIf(!nativeOk)('M3 · 排课执行编排（worker 池）', () => {
  type Ctx = {
    getDb: (typeof import('../db/connection'))['getDb']
    startSolveRun: (typeof import('./solverRunService'))['startSolveRun']
    cancelSolveRun: (typeof import('./solverRunService'))['cancelSolveRun']
    isSolveRunning: (typeof import('./solverRunService'))['isSolveRunning']
    listVersions: (typeof import('./scheduleResultService'))['listVersions']
    solve: (typeof import('@solver/solve'))['solve']
  }
  const r = {} as Ctx
  const ids = { semesterId: 0, classIds: [] as number[] }

  /** 与真实 worker 相同的协议：异步真跑 solve()，回放 progress / done / exit */
  function fakeSpawner(): WorkerSpawner {
    return (req: SolveRequest) => {
      const msgCbs: ((m: WorkerMessage) => void)[] = []
      const exitCbs: ((code: number) => void)[] = []
      setTimeout(() => {
        const result = r.solve(req.input, {
          seed: req.seed,
          starts: req.starts,
          timeBudgetMs: req.timeBudgetMs
        })
        const summary: SolveSummary = {
          status: result.status,
          seed: req.seed,
          unplacedCount: result.unplaced.length,
          violations: result.violations,
          diagnostics: result.diagnostics,
          lessons: result.lessons,
          stats: result.stats
        }
        const progressMsg: WorkerMessage = {
          type: 'progress',
          progress: { phase: 'construct', ratio: 0.5, message: '构造中', start: 1, totalStarts: 1 }
        }
        msgCbs.forEach((cb) => cb(progressMsg))
        msgCbs.forEach((cb) => cb({ type: 'done', summary }))
        exitCbs.forEach((cb) => cb(0))
      }, 0)
      return {
        terminate: vi.fn(() => {
          setTimeout(() => exitCbs.forEach((cb) => cb(1)), 0)
        }),
        onMessage: (cb) => msgCbs.push(cb),
        onExit: (cb) => exitCbs.push(cb)
      }
    }
  }

  /**
   * 手工 summary 的 spawner（不经 solve，用于择优与取消的精确控制）。
   * worker 在下一个宏任务自动完成；若在那之前被 terminate 则不再产出。
   */
  function scriptedSpawner(make: () => SolveSummary): WorkerSpawner {
    return () => {
      const msgCbs: ((m: WorkerMessage) => void)[] = []
      const exitCbs: ((code: number) => void)[] = []
      let terminated = false
      setTimeout(() => {
        if (terminated) return
        msgCbs.forEach((cb) => cb({ type: 'done', summary: make() }))
        exitCbs.forEach((cb) => cb(0))
      }, 0)
      return {
        terminate: vi.fn(() => {
          terminated = true
          setTimeout(() => exitCbs.forEach((cb) => cb(1)), 0)
        }),
        onMessage: (cb) => msgCbs.push(cb),
        onExit: (cb) => exitCbs.push(cb)
      }
    }
  }

  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
  const progressesOf = (events: ScheduleEventPayload[]): ScheduleProgressPayload[] =>
    events.filter((e): e is ScheduleProgressPayload => e.type === 'progress')
  const doneOf = (events: ScheduleEventPayload[]): ScheduleDonePayload => {
    const done = events.find((e): e is ScheduleDonePayload => e.type === 'done')
    expect(done).toBeTruthy()
    return done!
  }

  beforeAll(async () => {
    r.getDb = (await import('../db/connection')).getDb
    const runSvc = await import('./solverRunService')
    r.startSolveRun = runSvc.startSolveRun
    r.cancelSolveRun = runSvc.cancelSolveRun
    r.isSolveRunning = runSvc.isSolveRunning
    r.listVersions = (await import('./scheduleResultService')).listVersions
    r.solve = (await import('@solver/solve')).solve

    // ── 最小种子：初中部 1 个年级 2 个班（可完整排出） ──
    const db = r.getDb()
    const run = db.prepare.bind(db)
    ids.semesterId = Number(
      run(`INSERT INTO semester (name, is_current) VALUES ('2026-2027学年第一学期', 1)`).run()
        .lastInsertRowid
    )
    const stageId = (run('SELECT id FROM stage WHERE code = ?').get('junior') as { id: number }).id
    const gradeId = Number(
      run(
        `INSERT INTO grade (semester_id, stage_id, name, sort_order) VALUES (?, ?, '初一', 1)`
      ).run(ids.semesterId, stageId).lastInsertRowid
    )
    for (let i = 1; i <= 2; i++) {
      const rid = Number(
        run(`INSERT INTO classroom (name, room_type, capacity) VALUES (?, 'normal', 50)`).run(
          `教室${i}`
        ).lastInsertRowid
      )
      ids.classIds.push(
        Number(
          run(
            `INSERT INTO klass (grade_id, name, student_count, home_room_id) VALUES (?, ?, 45, ?)`
          ).run(gradeId, `初一(${i})班`, rid).lastInsertRowid
        )
      )
    }
    const t1 = Number(run(`INSERT INTO teacher (name) VALUES ('张老师')`).run().lastInsertRowid)
    const t2 = Number(run(`INSERT INTO teacher (name) VALUES ('李老师')`).run().lastInsertRowid)
    const chinese = run('SELECT id FROM subject WHERE name = ?').get('语文') as { id: number }
    const math = run('SELECT id FROM subject WHERE name = ?').get('数学') as { id: number }
    run(
      `INSERT INTO teaching_task (semester_id, class_id, subject_id, teacher_id, weekly_periods) VALUES (?, ?, ?, ?, 2)`
    ).run(ids.semesterId, ids.classIds[0], chinese.id, t1)
    run(
      `INSERT INTO teaching_task (semester_id, class_id, subject_id, teacher_id, weekly_periods) VALUES (?, ?, ?, ?, 2)`
    ).run(ids.semesterId, ids.classIds[0], math.id, t2)
    run(
      `INSERT INTO teaching_task (semester_id, class_id, subject_id, teacher_id, weekly_periods) VALUES (?, ?, ?, ?, 2)`
    ).run(ids.semesterId, ids.classIds[1], chinese.id, t1)
    run(
      `INSERT INTO teaching_task (semester_id, class_id, subject_id, teacher_id, weekly_periods) VALUES (?, ?, ?, ?, 2)`
    ).run(ids.semesterId, ids.classIds[1], math.id, t2)
  })

  it('端到端：多起点并行 → 进度汇总 → 择优 → 落库 → done 事件', async () => {
    const events: ScheduleEventPayload[] = []
    const runId = r.startSolveRun(
      ids.semesterId,
      { starts: 3 },
      (e) => events.push(e),
      fakeSpawner()
    )
    expect(runId).toMatch(/^run-/)
    expect(r.isSolveRunning()).toBe(true)
    await wait(50)
    expect(r.isSolveRunning()).toBe(false)

    const progresses = progressesOf(events)
    expect(progresses.length).toBeGreaterThan(0)
    // 每个假 worker 发 ratio 0.5，三个起点 → 汇总 0.5/3
    expect(progresses[0].ratio).toBeCloseTo(0.5 / 3, 5)
    expect(progresses[0].totalStarts).toBe(3)

    const done = doneOf(events)
    expect(done.status).toBe('solved')
    expect(done.versionId).not.toBeNull()
    expect(done.summary!.violations).toEqual([])
    expect(done.summary!.stats.accidentalBlocks).toBe(0)

    const versions = r.listVersions(ids.semesterId)
    expect(versions.length).toBe(1)
    expect(versions[0].id).toBe(done.versionId)
    expect(versions[0].name).toBe('自动排课 #1 · 均衡')
    expect(versions[0].lessonCount).toBe(8)
  })

  it('择优：未排更少的起点胜出', async () => {
    const good: SolveSummary = {
      status: 'solved',
      seed: 1,
      unplacedCount: 0,
      violations: [],
      diagnostics: [],
      lessons: [
        {
          unitId: 0,
          taskId: 1,
          classId: ids.classIds[0],
          subjectId: 1,
          teacherId: null,
          classroomId: null,
          slotId: 1,
          weekMode: 'all',
          blockIndex: 0,
          blockSize: 1
        }
      ],
      stats: {
        units: 1,
        periods: 1,
        assignedPeriods: 1,
        fixedPeriods: 0,
        starts: 1,
        elapsedMs: 5,
        prunedByAc3: 0,
        accidentalBlocks: 0
      }
    }
    const bad: SolveSummary = { ...good, unplacedCount: 2, lessons: [] }
    const events: ScheduleEventPayload[] = []
    // 前两个起点报坏结果，最后一个报好结果 → 择优选好结果
    let n = 0
    r.startSolveRun(
      ids.semesterId,
      { starts: 3 },
      (e) => events.push(e),
      scriptedSpawner(() => (n++ < 2 ? bad : good))
    )
    await wait(30)
    const done = doneOf(events)
    expect(done.status).toBe('solved')
    expect(done.summary!.unplacedCount).toBe(0)
    expect(done.lessonCount).toBe(1)
  })

  it('取消：terminate 全部 worker，不落库', async () => {
    const events: ScheduleEventPayload[] = []
    r.startSolveRun(
      ids.semesterId,
      { starts: 2 },
      (e) => events.push(e),
      scriptedSpawner(() => {
        throw new Error('取消后不应再产出结果')
      })
    )
    expect(r.cancelSolveRun()).toBe(true)
    await wait(30)
    const done = doneOf(events)
    expect(done.status).toBe('cancelled')
    expect(done.versionId).toBeNull()
    // 上一轮已落 2 个版本（端到端 1 + 择优 1），取消不应增加
    expect(r.listVersions(ids.semesterId).length).toBe(2)
    expect(r.cancelSolveRun()).toBe(false) // 没有进行中的任务
  })

  it('进行中不允许重复启动', async () => {
    r.startSolveRun(
      ids.semesterId,
      { starts: 1 },
      () => {},
      scriptedSpawner(() => {
        throw new Error('不应被求值')
      })
    )
    expect(() =>
      r.startSolveRun(
        ids.semesterId,
        { starts: 1 },
        () => {},
        scriptedSpawner(() => {
          throw new Error('不应被求值')
        })
      )
    ).toThrow(/进行中/)
    r.cancelSolveRun()
    await wait(30) // 等 terminate 的 exit 事件把 activeRun 清掉
  })

  it('infeasible：不建版本，诊断带回', async () => {
    const infeasible: SolveSummary = {
      status: 'infeasible',
      seed: 1,
      unplacedCount: 4,
      violations: [],
      diagnostics: [
        {
          level: 'error',
          code: 'CLASS_SUPPLY',
          title: '课时超出可用时段',
          detail: '缺口 4 节',
          suggestions: ['减少课时']
        }
      ],
      lessons: [],
      stats: {
        units: 4,
        periods: 4,
        assignedPeriods: 0,
        fixedPeriods: 0,
        starts: 1,
        elapsedMs: 3,
        prunedByAc3: 0,
        accidentalBlocks: 0
      }
    }
    const events: ScheduleEventPayload[] = []
    r.startSolveRun(
      ids.semesterId,
      { starts: 1 },
      (e) => events.push(e),
      scriptedSpawner(() => infeasible)
    )
    await wait(30)
    const done = doneOf(events)
    expect(done.status).toBe('infeasible')
    expect(done.versionId).toBeNull()
    expect(done.summary!.diagnostics.length).toBe(1)
    expect(r.listVersions(ids.semesterId).length).toBe(2) // 没有新增
  })
})
