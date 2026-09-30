import { describe, expect, it } from 'vitest'
import { buildContext } from './context'
import { scoreSolution, buildScoreCache, SOFT_CODES } from './scorer'
import { solve } from '../solve'
import { makeInput } from '../testing/fixture'

describe('M5 scorer', () => {
  it('scores a solved fixture and exposes all S1-S15 metrics', () => {
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

  it('keeps score computation independent from the input weight profile', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 2 })
    const result = solve(input, { seed: 3 })
    const context = buildContext(input)
    const balanced = scoreSolution(context, result.solution, { ...input.weights, S1: 1 })
    const teacherFirst = scoreSolution(context, result.solution, { ...input.weights, S1: 99 })
    expect(teacherFirst.total - balanced.total).toBeCloseTo(98 * balanced.metrics.S1)
  })
})
