import { describe, expect, it } from 'vitest'
import { buildContext } from './context'
import { optimizeQuality } from './optimizer'
import { verifyHardConstraints } from './verify'
import { solve } from '../solve'
import { makeInput } from '../testing/fixture'

describe('quality optimizer', () => {
  it('keeps a feasible solution and can be interrupted', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 2 })
    const result = solve(input, { seed: 2 })
    const optimized = optimizeQuality(buildContext(input), result.solution, {
      timeBudgetMs: 20,
      seed: 2
    })
    expect(verifyHardConstraints(buildContext(input), optimized.solution)).toHaveLength(0)
    expect(optimized.iterations).toBeGreaterThan(0)
  })
})
