import { describe, expect, it } from 'vitest'
import { buildBatchNames, defaultShortName, formatClassName } from './classNaming'

describe('shared/classNaming', () => {
  it('替换 {n} / {name} / {nn} 占位符', () => {
    expect(formatClassName('{name}({n})班', 3, '初一')).toBe('初一(3)班')
    expect(formatClassName('{name}{nn}班', 3, '高二')).toBe('高二03班')
    expect(formatClassName('{n}班', 12, '五年级')).toBe('12班')
  })

  it('批量生成 20 个班名，序号连续', () => {
    const names = buildBatchNames('{name}({n})班', 20, '初一')
    expect(names).toHaveLength(20)
    expect(names[0]).toBe('初一(1)班')
    expect(names[19]).toBe('初一(20)班')
  })

  it('支持自定义起始序号', () => {
    const names = buildBatchNames('{n}班', 3, '初一', 5)
    expect(names).toEqual(['5班', '6班', '7班'])
  })

  it('默认简称', () => {
    expect(defaultShortName(7)).toBe('7班')
  })
})
