import { getDb } from '../connection'
import type {
  RuleScopeRef,
  RuleScopeSummary,
  TimeRule,
  TimeRulePatch
} from '@shared/types/entities'
import type { RuleScopeType, RuleValue } from '@shared/domain'

interface RuleRow {
  id: number
  semester_id: number
  scope_type: string
  scope_id: number | null
  slot_id: number
  rule_value: string
}

function toEntity(r: RuleRow): TimeRule {
  return {
    id: r.id,
    semesterId: r.semester_id,
    scopeType: r.scope_type as RuleScopeType,
    scopeId: r.scope_id,
    slotId: r.slot_id,
    ruleValue: r.rule_value as RuleValue
  }
}

/** global 作用域的 scope_id 恒为 NULL；SQLite 里 `= NULL` 永假，必须用 IS NULL */
function scopeWhere(scope: RuleScopeRef): { sql: string; args: unknown[] } {
  if (scope.scopeType === 'global' || scope.scopeId == null) {
    return { sql: 'scope_type = ? AND scope_id IS NULL', args: [scope.scopeType] }
  }
  return { sql: 'scope_type = ? AND scope_id = ?', args: [scope.scopeType, scope.scopeId] }
}

export const timeRuleRepo = {
  /** 读某个作用域的整张规则网格 */
  listByScope(semesterId: number, scope: RuleScopeRef): TimeRule[] {
    const w = scopeWhere(scope)
    const rows = getDb()
      .prepare(`SELECT * FROM time_rule WHERE semester_id = ? AND ${w.sql} ORDER BY slot_id`)
      .all(semesterId, ...(w.args as never[])) as RuleRow[]
    return rows.map(toEntity)
  },

  /** 读整个学期的全部规则（组装 SolverInput 用） */
  listBySemester(semesterId: number): TimeRule[] {
    const rows = getDb()
      .prepare(
        'SELECT * FROM time_rule WHERE semester_id = ? ORDER BY scope_type, scope_id, slot_id'
      )
      .all(semesterId) as RuleRow[]
    return rows.map(toEntity)
  },

  /**
   * RuleGrid 一次拖刷的批量落库（**单事务**）。
   * `NORMAL` 视为「无规则」，直接删行，避免规则表被默认值撑爆
   * （240 班 × 40 槽全存 NORMAL 会平白多出近万行无意义数据）。
   */
  setCells(semesterId: number, scope: RuleScopeRef, patches: TimeRulePatch[]): TimeRule[] {
    const db = getDb()
    const w = scopeWhere(scope)
    const del = db.prepare(
      `DELETE FROM time_rule WHERE semester_id = ? AND ${w.sql} AND slot_id = ?`
    )
    const ins = db.prepare(
      `INSERT INTO time_rule (semester_id, scope_type, scope_id, slot_id, rule_value)
       VALUES (?, ?, ?, ?, ?)`
    )
    const scopeId = scope.scopeType === 'global' ? null : scope.scopeId
    const run = db.transaction(() => {
      for (const p of patches) {
        del.run(semesterId, ...(w.args as never[]), p.slotId)
        if (p.ruleValue !== 'NORMAL') {
          ins.run(semesterId, scope.scopeType, scopeId, p.slotId, p.ruleValue)
        }
      }
    })
    run()
    return this.listByScope(semesterId, scope)
  },

  /** 清空某作用域的全部规则 */
  clearScope(semesterId: number, scope: RuleScopeRef): number {
    const w = scopeWhere(scope)
    return getDb()
      .prepare(`DELETE FROM time_rule WHERE semester_id = ? AND ${w.sql}`)
      .run(semesterId, ...(w.args as never[])).changes
  },

  /** 把一个作用域的规则整套复制到另一批作用域（「应用到同学科教师」） */
  copyScope(semesterId: number, from: RuleScopeRef, targets: RuleScopeRef[]): number {
    const db = getDb()
    const source = this.listByScope(semesterId, from)
    const ins = db.prepare(
      `INSERT INTO time_rule (semester_id, scope_type, scope_id, slot_id, rule_value)
       VALUES (?, ?, ?, ?, ?)`
    )
    let n = 0
    const run = db.transaction(() => {
      for (const t of targets) {
        if (t.scopeType === from.scopeType && t.scopeId === from.scopeId) continue
        this.clearScope(semesterId, t)
        const scopeId = t.scopeType === 'global' ? null : t.scopeId
        for (const r of source) {
          ins.run(semesterId, t.scopeType, scopeId, r.slotId, r.ruleValue)
          n += 1
        }
      }
    })
    run()
    return n
  },

  /** 「哪些实体配过规则」的统计，供作用域切换器显示角标 */
  summary(semesterId: number): RuleScopeSummary[] {
    const rows = getDb()
      .prepare(
        `SELECT scope_type, scope_id,
                COUNT(*) AS n,
                SUM(CASE WHEN rule_value='FORBIDDEN' THEN 1 ELSE 0 END) AS forbidden,
                SUM(CASE WHEN rule_value='AVOID'     THEN 1 ELSE 0 END) AS avoid,
                SUM(CASE WHEN rule_value='PREFERRED' THEN 1 ELSE 0 END) AS preferred
           FROM time_rule WHERE semester_id = ?
          GROUP BY scope_type, scope_id`
      )
      .all(semesterId) as {
      scope_type: string
      scope_id: number | null
      n: number
      forbidden: number
      avoid: number
      preferred: number
    }[]
    return rows.map((r) => ({
      scopeType: r.scope_type as RuleScopeType,
      scopeId: r.scope_id,
      ruleCount: r.n,
      forbiddenCount: r.forbidden,
      avoidCount: r.avoid,
      preferredCount: r.preferred
    }))
  }
}
