import { describe, expect, it } from 'vitest'
import { sum, APP_NAME, DEFAULT_SCHOOL_DAYS } from './constants'

describe('shared/constants', () => {
  it('sum 累加数组', () => {
    expect(sum([1, 2, 3])).toBe(6)
    expect(sum([])).toBe(0)
  })

  it('导出的常量符合约定', () => {
    expect(APP_NAME).toBe('智课排')
    expect(DEFAULT_SCHOOL_DAYS).toBe(5)
  })
})
