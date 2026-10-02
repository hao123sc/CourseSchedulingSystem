/**
 * 四层时段规则值（决策 D4）的合并与判定 —— **唯一实现**。
 *
 * 渲染端（RuleGrid 预览、M6 拖拽落点着色）与引擎（H5 禁排、S4 避排、S5 优选）
 * 共用本文件，杜绝「前端说能排、引擎说不能排」。
 *
 * 禁止 import Electron / Node。
 */
import type { RuleScopeType, RuleValue } from '../domain'

/** 一条已展开的规则：某作用域在某时段上的取值 */
export interface ScopedRule {
  scopeType: RuleScopeType
  scopeId: number | null
  slotId: number
  ruleValue: RuleValue
}

/**
 * 作用域特异性：数字越大越「具体」，具体的覆盖笼统的。
 * teacher / class 是直接当事人，优先于 subject / grade 这类批量规则，global 兜底。
 */
export const SCOPE_SPECIFICITY: Record<RuleScopeType, number> = {
  global: 0,
  grade: 1,
  subject: 2,
  class: 3,
  teacher: 4
}

/** 冲突时的保守程度：同特异性下取值更保守者胜（避排 > 优选） */
const CONSERVATISM: Record<RuleValue, number> = {
  PREFERRED: 0,
  NORMAL: 1,
  AVOID: 2,
  FORBIDDEN: 3
}

/** 判定一节课要落在某 slot 上，需要同时满足哪些作用域的规则 */
export interface RuleQueryContext {
  classId?: number | null
  teacherId?: number | null
  subjectId?: number | null
  gradeId?: number | null
}

function appliesTo(rule: ScopedRule, ctx: RuleQueryContext): boolean {
  switch (rule.scopeType) {
    case 'global':
      return true
    case 'teacher':
      return rule.scopeId != null && rule.scopeId === ctx.teacherId
    case 'class':
      return rule.scopeId != null && rule.scopeId === ctx.classId
    case 'subject':
      return rule.scopeId != null && rule.scopeId === ctx.subjectId
    case 'grade':
      return rule.scopeId != null && rule.scopeId === ctx.gradeId
    default:
      return false
  }
}

/**
 * 合并多条命中规则，得出某 (课, slot) 的**有效规则值**。
 *
 * 规则：
 * 1. 任一作用域标 `FORBIDDEN` → 直接 `FORBIDDEN`（硬约束一票否决，不看特异性）
 * 2. 否则取**特异性最高**的那条；特异性相同且取值不同时，取更保守的一条
 * 3. 没有任何命中 → `NORMAL`
 */
export function mergeRuleValues(hits: ScopedRule[]): RuleValue {
  if (hits.length === 0) return 'NORMAL'
  let best: ScopedRule | null = null
  for (const r of hits) {
    if (r.ruleValue === 'FORBIDDEN') return 'FORBIDDEN'
    if (best == null) {
      best = r
      continue
    }
    const ds = SCOPE_SPECIFICITY[r.scopeType] - SCOPE_SPECIFICITY[best.scopeType]
    if (ds > 0 || (ds === 0 && CONSERVATISM[r.ruleValue] > CONSERVATISM[best.ruleValue])) {
      best = r
    }
  }
  return best ? best.ruleValue : 'NORMAL'
}

/** 在一堆规则里查某 (slot, 上下文) 的有效规则值 */
export function resolveRuleValue(
  rules: ScopedRule[],
  slotId: number,
  ctx: RuleQueryContext
): RuleValue {
  const hits = rules.filter((r) => r.slotId === slotId && appliesTo(r, ctx))
  return mergeRuleValues(hits)
}

/** `FORBIDDEN` 即硬约束 H5：该时段绝对不可用 */
export function isForbidden(value: RuleValue): boolean {
  return value === 'FORBIDDEN'
}

/**
 * 预索引：把规则按 slotId 分桶，供引擎在内层循环里 O(1) 取用。
 * key = slotId，value = 该 slot 上的全部规则。
 */
export function indexRulesBySlot(rules: ScopedRule[]): Map<number, ScopedRule[]> {
  const map = new Map<number, ScopedRule[]>()
  for (const r of rules) {
    const bucket = map.get(r.slotId)
    if (bucket) bucket.push(r)
    else map.set(r.slotId, [r])
  }
  return map
}
