/**
 * 「事实连堂」偏好（2026-09-30 用户要求）：
 * 未配置连堂的课，同班同学科不允许落在相邻节次——有得选时必须避开；
 * 显式连堂（consecutiveCount × consecutiveSize）不受影响；
 * 挤不下时让位于可行性（照样排满、硬约束仍为 0）。
 */
import { describe, expect, it } from 'vitest'
import { makeInput } from '../testing/fixture'
import { buildContext } from './context'
import { Board } from './board'
import { countAccidentalBlocks } from './adjacency'
import { solve } from '../solve'
import type { SolverInput, SolverTask } from '../model/types'

describe('事实连堂 · 求解行为', () => {
  it('有得选时，同班同学科的单节课绝不排成相邻', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 4 }) // 20 格排 8 节，余量充足
    const r = solve(input)
    expect(r.status).toBe('solved')
    expect(r.stats.accidentalBlocks).toBe(0)
  })

  it('显式配置的连堂照常成块，且不计为事实连堂', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 4 })
    input.tasks = input.tasks.map((t) =>
      t.subjectId === 1 ? { ...t, consecutiveCount: 1, consecutiveSize: 2 } : t
    )
    const r = solve(input)
    expect(r.status).toBe('solved')
    expect(r.stats.accidentalBlocks).toBe(0)
    // 1×2 连堂 + 2 节单节 → 连堂块里的两节都带 blockSize = 2
    expect(r.lessons.filter((l) => l.subjectId === 1 && l.blockSize === 2).length).toBe(2)
    // 剩下的单节不与连堂块挨着
    expect(r.stats.accidentalBlocks).toBe(0)
  })

  it('预排锁定的课也参与相邻判定，剩余课时会主动避开它', () => {
    const input = makeInput({ classes: 1, days: 1, periodsPerDay: 4, weeklyPeriods: 2 })
    input.tasks = input.tasks.map((t) => (t.subjectId === 2 ? { ...t, weeklyPeriods: 1 } : t))
    input.fixedLessons = [
      {
        id: 1,
        kind: 'lesson',
        classId: 1,
        gradeId: null,
        subjectId: 1,
        teacherId: 11,
        classroomId: 101,
        slotId: 1,
        label: null
      }
    ]
    const r = solve(input)
    expect(r.status).toBe('solved')
    // 语文 2 节：1 节被预排钉在第 1 格，剩 1 节必须避开第 2 格（去第 3/4 格）
    expect(r.stats.accidentalBlocks).toBe(0)
  })

  it('挤不下时偏好让位于可行性：照样排满，硬约束仍为 0', () => {
    // 1 天 4 格排「语文 3 + 数学 1」：语文占 4 格中的 3 格，必有相邻（鸽笼）
    const input = makeInput({ classes: 1, days: 1, periodsPerDay: 4, weeklyPeriods: 3 })
    input.tasks = input.tasks.map((t) => (t.subjectId === 2 ? { ...t, weeklyPeriods: 1 } : t))
    const r = solve(input)
    expect(r.status).toBe('solved')
    expect(r.violations).toEqual([])
    expect(r.unplaced).toEqual([])
    expect(r.stats.accidentalBlocks).toBeGreaterThanOrEqual(1)
  })

  it('多起点会把事实连堂对数当次级择优指标', () => {
    const input = makeInput({ classes: 6, weeklyPeriods: 3 })
    const r = solve(input, { seed: 7, starts: 3 })
    expect(r.status).toBe('solved')
    expect(r.stats.accidentalBlocks).toBe(0)
  })
})

describe('countAccidentalBlocks · 判定口径', () => {
  /** 手工把单元钉在指定槽位上，绕过构造器看纯计数逻辑 */
  function placeAt(
    ctx: ReturnType<typeof buildContext>,
    board: Board,
    unitId: number,
    slotId: number
  ): void {
    const si = ctx.slotIdx.get(slotId)!
    const wid = ctx.windows.findIndex((w) => w.length === 1 && w[0] === si)
    expect(wid).toBeGreaterThanOrEqual(0)
    const probe = board.canPlace(ctx.units[unitId], wid)
    expect(probe.ok).toBe(true)
    board.place(ctx.units[unitId], wid, probe.roomIds)
  }

  /** 1 个班、1 天 4 节（上午 2 + 下午 2），两条同学科任务各 1 节，周模式可调 */
  function twinTaskInput(
    modeA: 'all' | 'odd' | 'even',
    modeB: 'all' | 'odd' | 'even'
  ): SolverInput {
    const input = makeInput({ classes: 1, days: 1, periodsPerDay: 4, weeklyPeriods: 1 })
    const base = input.tasks.find((t) => t.subjectId === 1)!
    const twin = (id: number, weekMode: 'all' | 'odd' | 'even'): SolverTask => ({
      ...base,
      id,
      weekMode
    })
    input.tasks = [twin(1, modeA), twin(2, modeB)]
    return input
  }

  it('同班同学科相邻 → 计 1 对', () => {
    const input = twinTaskInput('all', 'all')
    const ctx = buildContext(input)
    const board = new Board(ctx)
    placeAt(ctx, board, 0, 1)
    placeAt(ctx, board, 1, 2)
    expect(countAccidentalBlocks(ctx, board.toSolution(1, []))).toBe(1)
  })

  it('跨分段（午休两侧）不算相邻', () => {
    const input = twinTaskInput('all', 'all')
    const ctx = buildContext(input)
    const board = new Board(ctx)
    placeAt(ctx, board, 0, 2) // 上午末节
    placeAt(ctx, board, 1, 3) // 下午首节
    expect(countAccidentalBlocks(ctx, board.toSolution(1, []))).toBe(0)
  })

  it('单双周错开的两节课在任何一周都不挨着 → 不计', () => {
    const input = twinTaskInput('odd', 'even')
    const ctx = buildContext(input)
    const board = new Board(ctx)
    placeAt(ctx, board, 0, 1)
    placeAt(ctx, board, 1, 2)
    expect(countAccidentalBlocks(ctx, board.toSolution(1, []))).toBe(0)
  })

  it('移除后平面会还原，计数跟着回落', () => {
    const input = twinTaskInput('all', 'all')
    const ctx = buildContext(input)
    const board = new Board(ctx)
    placeAt(ctx, board, 0, 1)
    placeAt(ctx, board, 1, 2)
    board.remove(1)
    expect(countAccidentalBlocks(ctx, board.toSolution(1, []))).toBe(0)
  })
})
