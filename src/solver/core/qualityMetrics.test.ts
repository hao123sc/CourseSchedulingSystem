import { describe, expect, it } from 'vitest'
import { buildContext } from './context'
import { measureQuality, assertQualityMetrics } from './qualityMetrics'
import { solve } from '../solve'
import { makeInput } from '../testing/fixture'

describe('quality regression metrics', () => {
  it('measures a solved schedule and accepts its bounded metrics', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 2 })
    const result = solve(input, { seed: 9, qualityOptimize: false })
    const metrics = measureQuality(buildContext(input), result.solution)
    expect(metrics.maxTeacherDayPeriods).toBeLessThanOrEqual(6)
    expect(metrics.consecutiveCompleteness).toBe(1)
    expect(metrics.sameSubjectDayRepeatRate).toBeGreaterThanOrEqual(0)
    expect(metrics.importantMorningRate).toBeGreaterThanOrEqual(0)
  })

  it('rejects a metric regression', () => {
    expect(() =>
      assertQualityMetrics(
        {
          maxTeacherDayPeriods: 7,
          teacherGapCount: 0,
          sameSubjectDayRepeatRate: 0,
          importantMorningRate: 1,
          consecutiveCompleteness: 1
        },
        10
      )
    ).toThrow(/教师日课时/)
  })
})
