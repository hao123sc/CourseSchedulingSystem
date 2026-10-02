import { describe, expect, it } from 'vitest'
import { buildContext } from './context'
import { scoreSolution, buildScoreCache, updateScoreCache, SOFT_CODES } from './scorer'
import { solve } from '../solve'
import { makeInput } from '../testing/fixture'
import type { Solution } from '../model/solution'

describe('M5 scorer', () => {
  it('scores a solved fixture and exposes all S1-S16 metrics', () => {
    const input = makeInput({ days: 5, periodsPerDay: 4, classes: 2, weeklyPeriods: 2 })
    const result = solve(input, { seed: 7 })
    expect(result.status).toBe('solved')
    const scored = scoreSolution(result.ctx, result.solution)

    expect(Object.keys(scored.metrics).sort()).toEqual([...SOFT_CODES].sort())
    expect(scored.total).toBeCloseTo(
      SOFT_CODES.reduce((sum, code) => sum + (input.weights[code] ?? 0) * scored.metrics[code], 0)
    )
    expect(scored.metrics.S9).toBe(0)
    expect(Number.isFinite(scored.total)).toBe(true)
  })

  it('builds classDay, teacherDay and subjectDay incremental indexes', () => {
    const input = makeInput({ days: 5, periodsPerDay: 4, classes: 1, weeklyPeriods: 2 })
    const result = solve(input, { seed: 11 })
    const cache = buildScoreCache(result.ctx, result.solution)

    expect([...cache.classDay.values()].reduce((a, b) => a + b, 0)).toBe(4)
    expect([...cache.teacherDay.values()].reduce((a, b) => a + b, 0)).toBe(4)
    expect([...cache.subjectDay.values()].reduce((a, b) => a + b, 0)).toBe(4)
  })

  it('updates only changed units and matches a fresh cache', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 2 })
    const result = solve(input, { seed: 13, qualityOptimize: false })
    const ctx = buildContext(input)
    const ids = [...result.solution.assignments.keys()]
    const cache = buildScoreCache(ctx, result.solution)
    const first = result.solution.assignments.get(ids[0])!
    const target = ctx.windows.find(
      (window) => window.length === first.slotIds.length && window[0] !== first.slotIds[0]
    )!
    const before = [...first.slotIds]
    first.slotIds = target.map((slot) => ctx.slots[slot].id)
    first.slotId = first.slotIds[0]
    updateScoreCache(ctx, result.solution, cache, [ids[0]])
    const fresh = buildScoreCache(ctx, result.solution)
    expect(cache.classDay).toEqual(fresh.classDay)
    expect(cache.teacherDay).toEqual(fresh.teacherDay)
    expect(cache.subjectDay).toEqual(fresh.subjectDay)
    first.slotIds = before
  })

  it('penalizes a class day whose first formal period is empty', () => {
    const input = makeInput({ days: 2, periodsPerDay: 2, classes: 1, weeklyPeriods: 1 })
    const context = buildContext(input)
    const later: Solution = {
      assignments: new Map([
        [0, { unitId: 0, slotId: 2, slotIds: [2], roomIds: [101], roomId: 101 }],
        [1, { unitId: 1, slotId: 4, slotIds: [4], roomIds: [101], roomId: 101 }]
      ]),
      unplaced: [],
      seed: 1
    }
    const first: Solution = {
      assignments: new Map([
        [0, { unitId: 0, slotId: 1, slotIds: [1], roomIds: [101], roomId: 101 }],
        [1, { unitId: 1, slotId: 3, slotIds: [3], roomIds: [101], roomId: 101 }]
      ]),
      unplaced: [],
      seed: 1
    }

    expect(scoreSolution(context, later, { S16: 200 }).metrics.S16).toBe(2)
    expect(scoreSolution(context, first, { S16: 200 }).metrics.S16).toBe(0)
    expect(scoreSolution(context, later, { S16: 200 }).total).toBe(400)
  })

  it('counts a fixed lesson in the first period as occupied', () => {
    const input = makeInput({ days: 1, periodsPerDay: 2, classes: 1, weeklyPeriods: 1 })
    input.fixedLessons.push({
      id: 1,
      kind: 'lesson',
      classId: 1,
      gradeId: null,
      subjectId: 1,
      teacherId: 11,
      classroomId: 101,
      slotId: 1,
      label: '预排语文'
    })
    const context = buildContext(input)
    const solution: Solution = {
      assignments: new Map([
        [0, { unitId: 0, slotId: 2, slotIds: [2], roomIds: [101], roomId: 101 }]
      ]),
      unplaced: [],
      seed: 1
    }
    expect(scoreSolution(context, solution, { S16: 200 }).metrics.S16).toBe(0)
  })

  it('keeps score computation independent from the input weight profile', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 2 })
    const result = solve(input, { seed: 3 })
    const context = buildContext(input)
    const balanced = scoreSolution(context, result.solution, { ...input.weights, S1: 1 })
    const teacherFirst = scoreSolution(context, result.solution, { ...input.weights, S1: 99 })
    expect(teacherFirst.total - balanced.total).toBeCloseTo(98 * balanced.metrics.S1)
  })
})
