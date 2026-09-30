/**
 * M3 验收基准：示范高完中 120 班（初中部 60 + 高中部 60）一次排完。
 *
 * 跑法：`npm run bench`（走 vitest.bench.config.ts，不与单测混跑）。
 * 流程：临时库 → 跑真实迁移 + 真实种子（scripts/seed-m2-demo.cjs）→
 *       真实 `buildSolverInput()` 组装快照 → `solve()` → `verifyHardConstraints()`。
 * 除了 sqlite 驱动是 node:sqlite 壳，其余全是生产代码路径。
 *
 * 断言口径（docs/06 M3 验收 + 2026-09-29 补记）：
 *   · 硬约束违反 = 0
 *   · 未排课时 = 0
 *   · 60 班（初中部单独一跑）≤ 10s
 *   · 120 班给出实测耗时（不设硬阈值，超过 30s 预算才判失败）
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { solve } from '../solve'
import { verifyHardConstraints } from '../core/verify'
import type { SolverInput } from '../model/types'

const root = resolve(__dirname, '../../..')
const dir = mkdtempSync(join(tmpdir(), 'zhikepai-bench-'))
// 主进程的 getDbPath() 走 electron 的 app.getAppPath()/.local-data/data.db，
// 这里把 electron 换成桩，指向临时目录（与数据层集成测试同一套办法）
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => dir, getPath: () => dir }
}))

let input: SolverInput

beforeAll(async () => {
  const dbPath = join(dir, '.local-data', 'data.db')
  mkdirSync(join(dir, '.local-data'), { recursive: true })
  // 真实种子脚本：120 班 / 1520 条任务 3900 节 / 373 条规则 / 186 条预排 / 3 约束组
  execFileSync(
    process.execPath,
    ['-r', join(root, 'scripts/test/node-sqlite-driver.cjs'), join(root, 'scripts/seed-m2-demo.cjs')],
    { env: { ...process.env, ZHIKEPAI_DB: dbPath }, stdio: 'pipe' }
  )
  const { buildSolverInput } = await import('../../main/services/solverInputService')
  const { getDb } = await import('../../main/db/connection')
  // 取"当前学期"（is_current=1），不是 id 最大的那个 —— 种子会同时建下学期的空壳
  const semesterId = (
    getDb()
      .prepare('SELECT id FROM semester ORDER BY is_current DESC, id ASC LIMIT 1')
      .get() as { id: number }
  ).id
  input = buildSolverInput(semesterId)

})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function report(label: string, input: SolverInput): void {
  const t0 = Date.now()
  const r = solve(input, { seed: 20260929, starts: 1, timeBudgetMs: 60_000 })
  const elapsed = Date.now() - t0
  const violations = verifyHardConstraints(r.ctx, r.solution)
  const byCode = violations.reduce<Record<string, number>>((m, v) => {
    m[v.code] = (m[v.code] ?? 0) + 1
    return m
  }, {})

  // eslint-disable-next-line no-console
  console.log(
    [
      `\n── ${label} ──`,
      `  班级 ${input.classes.length} · 教师 ${input.teachers.length} · 任务 ${input.tasks.length}`,
      `  课时单元 ${r.stats.units} 个 / 待排 ${r.stats.periods} 节 / 预排锁定 ${r.stats.fixedPeriods} 节`,
      `  AC-3 剔除候选 ${r.stats.prunedByAc3} 个`,
      `  状态 ${r.status} · 未排 ${r.unplaced.length} 节 · 硬约束违反 ${violations.length} ${JSON.stringify(byCode)}`,
      `  事实连堂 ${r.stats.accidentalBlocks} 对（未配置连堂却同学科相邻）`,
      `  实测耗时 ${elapsed} ms`,
      r.diagnostics.length > 0 ? `  诊断 ${r.diagnostics.slice(0, 3).map((d) => d.title).join(' | ')}` : ''
    ].join('\n')
  )

  expect(violations).toEqual([])
  expect(r.unplaced).toEqual([])
  expect(r.status).toBe('solved')
  // 2026-09-30 用户要求：未配置连堂的课不得出现同学科相邻（事实连堂目标 0）
  expect(r.stats.accidentalBlocks).toBe(0)
}

/** 只保留指定学段的切片，用来单独测 60 班规模 */
function sliceStage(full: SolverInput, stageCode: string): SolverInput {
  const stage = full.stages.find((s) => s.code === stageCode)
  if (!stage) throw new Error(`没有学段 ${stageCode}`)
  const classes = full.classes.filter((c) => c.stageId === stage.id)
  const classIds = new Set(classes.map((c) => c.id))
  const grades = full.grades.filter((g) => g.stageId === stage.id)
  const gradeIds = new Set(grades.map((g) => g.id))
  const tasks = full.tasks.filter((t) => classIds.has(t.classId))
  const teacherIds = new Set(tasks.map((t) => t.teacherId).filter((x): x is number => x != null))
  const slotIds = new Set(full.slots.filter((s) => s.stageId === stage.id).map((s) => s.id))
  return {
    ...full,
    stages: [stage],
    slots: full.slots.filter((s) => slotIds.has(s.id)),
    grades,
    classes,
    teachers: full.teachers.filter((t) => teacherIds.has(t.id)),
    tasks,
    timeRules: full.timeRules.filter((r) => slotIds.has(r.slotId)),
    fixedLessons: full.fixedLessons.filter(
      (f) =>
        slotIds.has(f.slotId) &&
        (f.classId == null || classIds.has(f.classId)) &&
        (f.gradeId == null || gradeIds.has(f.gradeId))
    )
  }
}

it('初中部 60 班 ≤ 10s 排完且硬约束违反 = 0', () => {
  const junior = sliceStage(input, 'junior')
  expect(junior.classes.length).toBe(60)
  const t0 = Date.now()
  report('初中部 60 班', junior)
  expect(Date.now() - t0).toBeLessThanOrEqual(10_000)
})

it('高中部 60 班排完且硬约束违反 = 0', () => {
  report('高中部 60 班', sliceStage(input, 'senior'))
})

it('示范高完中 120 班双学段一次排完，硬约束违反 = 0', () => {
  expect(input.classes.length).toBe(120)
  report('示范高完中 120 班（初中部 + 高中部）', input)
})
