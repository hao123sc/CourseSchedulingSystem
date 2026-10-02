import { describe, expect, it } from 'vitest'
import { buildContext } from './context'
import { kempe, hungarian, move, ruinRecreate, swap } from './moves'
import { solve } from '../solve'
import { makeInput } from '../testing/fixture'

describe('solver moves', () => {
  it('applies and undoes move and swap', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 2 })
    const result = solve(input, { seed: 4 })
    const ids = [...result.solution.assignments.keys()]
    const ctx = result.ctx
    const first = result.solution.assignments.get(ids[0])!
    const old = [...first.slotIds]
    const target = ctx.windows.find((w) => w.length === first.slotIds.length && w[0] !== old[0])!
    const mv = move(ctx, result.solution, ids[0], target)
    mv.apply(result.solution)
    expect(result.solution.assignments.get(ids[0])!.slotIds).toEqual(target)
    mv.undo(result.solution)
    expect(result.solution.assignments.get(ids[0])!.slotIds).toEqual(old)
    const sw = swap(result.solution, ids[0], ids[1])
    sw.apply(result.solution)
    sw.undo(result.solution)
    expect(result.solution.assignments.get(ids[0])!.slotIds).toEqual(old)
  })

  it('finds a minimum-cost assignment', () => {
    expect(
      hungarian([
        [4, 1],
        [2, 3]
      ])
    ).toEqual([1, 0])
  })

  it('keeps Kempe and ruin-recreate reversible', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 2 })
    const result = solve(input, { seed: 8 })
    const ctx = buildContext(input)
    const ids = [...result.solution.assignments.keys()]
    const a = result.solution.assignments.get(ids[0])!
    const before = [...a.slotIds]
    const other = ctx.slots.find((s) => s.id !== a.slotIds[0])!.id
    const km = kempe(ctx, result.solution, ids[0], a.slotIds[0], other)
    km.apply(result.solution)
    km.undo(result.solution)
    expect(result.solution.assignments.get(ids[0])!.slotIds).toEqual(before)
    const rr = ruinRecreate(result.solution, [ids[0]], new Map())
    rr.apply(result.solution)
    expect(result.solution.assignments.has(ids[0])).toBe(false)
    rr.undo(result.solution)
    expect(result.solution.assignments.has(ids[0])).toBe(true)
  })
})
