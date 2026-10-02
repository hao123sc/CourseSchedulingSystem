import { describe, expect, it } from 'vitest'
import type { SolverSlot } from '../model/types'
import { firstFormalSlotIds, stageDayKey } from './formalPeriods'

const slot = (
  id: number,
  periodName: string,
  periodIndex: number,
  segment: SolverSlot['segment'] = 'morning'
): SolverSlot => ({
  id,
  stageId: 3,
  dayOfWeek: 1,
  periodIndex,
  periodName,
  segment,
  isTeaching: true,
  sortOrder: periodIndex
})

describe('first formal period', () => {
  it('does not treat early reading as the first formal lesson', () => {
    const slots = [slot(1, '早读', 1), slot(2, '第1节', 2), slot(3, '第2节', 3)]
    expect(firstFormalSlotIds(slots).get(stageDayKey(3, 1))).toBe(2)
  })

  it('falls back to the earliest regular teaching slot for legacy names', () => {
    const slots = [slot(1, '晨读', 1), slot(2, '上午一', 2), slot(3, '晚自习', 3, 'evening')]
    expect(firstFormalSlotIds(slots).get(stageDayKey(3, 1))).toBe(2)
  })
})
