import { describe, expect, it } from 'vitest'
import {
  indexRulesBySlot,
  isForbidden,
  mergeRuleValues,
  resolveRuleValue,
  SCOPE_SPECIFICITY,
  type ScopedRule
} from './ruleValue'

const rule = (
  scopeType: ScopedRule['scopeType'],
  scopeId: number | null,
  slotId: number,
  ruleValue: ScopedRule['ruleValue']
): ScopedRule => ({ scopeType, scopeId, slotId, ruleValue })

describe('四层规则值合并（D4）', () => {
  it('没有任何规则时返回 NORMAL', () => {
    expect(mergeRuleValues([])).toBe('NORMAL')
  })

  it('任一作用域 FORBIDDEN 一票否决，不看特异性', () => {
    expect(
      mergeRuleValues([rule('teacher', 1, 10, 'PREFERRED'), rule('global', null, 10, 'FORBIDDEN')])
    ).toBe('FORBIDDEN')
    expect(
      mergeRuleValues([rule('global', null, 10, 'FORBIDDEN'), rule('teacher', 1, 10, 'PREFERRED')])
    ).toBe('FORBIDDEN')
  })

  it('特异性高的作用域覆盖笼统的', () => {
    // 全局优选 vs 教师避排 → 教师更具体
    expect(
      mergeRuleValues([rule('global', null, 10, 'PREFERRED'), rule('teacher', 1, 10, 'AVOID')])
    ).toBe('AVOID')
    // 年级避排 vs 班级优选 → 班级更具体
    expect(
      mergeRuleValues([rule('grade', 3, 10, 'AVOID'), rule('class', 7, 10, 'PREFERRED')])
    ).toBe('PREFERRED')
  })

  it('同特异性冲突时取更保守的一方（避排胜过优选）', () => {
    expect(
      mergeRuleValues([rule('class', 7, 10, 'PREFERRED'), rule('class', 9, 10, 'AVOID')])
    ).toBe('AVOID')
  })

  it('特异性次序：teacher > class > subject > grade > global', () => {
    expect(SCOPE_SPECIFICITY.teacher).toBeGreaterThan(SCOPE_SPECIFICITY.class)
    expect(SCOPE_SPECIFICITY.class).toBeGreaterThan(SCOPE_SPECIFICITY.subject)
    expect(SCOPE_SPECIFICITY.subject).toBeGreaterThan(SCOPE_SPECIFICITY.grade)
    expect(SCOPE_SPECIFICITY.grade).toBeGreaterThan(SCOPE_SPECIFICITY.global)
  })
})

describe('resolveRuleValue 按上下文过滤', () => {
  const rules: ScopedRule[] = [
    rule('global', null, 1, 'AVOID'),
    rule('teacher', 100, 1, 'PREFERRED'),
    rule('teacher', 200, 1, 'FORBIDDEN'),
    rule('class', 50, 2, 'FORBIDDEN'),
    rule('subject', 9, 3, 'AVOID'),
    rule('grade', 4, 3, 'PREFERRED')
  ]

  it('只命中作用于该课的规则', () => {
    // 教师 100 的课：全局 AVOID 被教师 PREFERRED 覆盖
    expect(resolveRuleValue(rules, 1, { teacherId: 100 })).toBe('PREFERRED')
    // 教师 200 的课：FORBIDDEN
    expect(resolveRuleValue(rules, 1, { teacherId: 200 })).toBe('FORBIDDEN')
    // 无关教师：只剩全局 AVOID
    expect(resolveRuleValue(rules, 1, { teacherId: 999 })).toBe('AVOID')
  })

  it('不同 slot 互不影响', () => {
    expect(resolveRuleValue(rules, 2, { classId: 50 })).toBe('FORBIDDEN')
    expect(resolveRuleValue(rules, 2, { classId: 51 })).toBe('NORMAL')
  })

  it('学科规则比年级规则更具体', () => {
    expect(resolveRuleValue(rules, 3, { subjectId: 9, gradeId: 4 })).toBe('AVOID')
  })

  it('global 规则对所有课都生效', () => {
    expect(resolveRuleValue([rule('global', null, 5, 'FORBIDDEN')], 5, {})).toBe('FORBIDDEN')
  })
})

describe('辅助函数', () => {
  it('isForbidden 只对 FORBIDDEN 为真', () => {
    expect(isForbidden('FORBIDDEN')).toBe(true)
    expect(isForbidden('AVOID')).toBe(false)
    expect(isForbidden('NORMAL')).toBe(false)
    expect(isForbidden('PREFERRED')).toBe(false)
  })

  it('indexRulesBySlot 按 slot 正确分桶', () => {
    const idx = indexRulesBySlot([
      rule('global', null, 1, 'AVOID'),
      rule('teacher', 1, 1, 'PREFERRED'),
      rule('class', 2, 7, 'FORBIDDEN')
    ])
    expect(idx.get(1)).toHaveLength(2)
    expect(idx.get(7)).toHaveLength(1)
    expect(idx.get(99)).toBeUndefined()
  })
})
