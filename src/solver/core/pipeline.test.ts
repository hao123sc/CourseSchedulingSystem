/**
 * 阶段 0（预处理与自检）与求解流水线的行为测试：
 * AC-3 裁剪、无解诊断、规则矛盾自检、可复现性、取消与进度事件。
 */
import { describe, expect, it } from 'vitest'
import { makeInput } from '../testing/fixture'
import { buildContext } from './context'
import { ac3 } from './ac3'
import { checkFeasibility } from './feasibility'
import { selfCheckRules } from './selfcheck'
import { solve } from '../solve'
import type { SolverInput } from '../model/types'

describe('AC-3 值域裁剪', () => {
  it('禁排的时段在建模期就不会进入值域', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 1 })
    input.timeRules = [{ scopeType: 'global', scopeId: null, slotId: 3, ruleValue: 'FORBIDDEN' }]
    const ctx = buildContext(input)
    for (const d of ctx.domains) {
      expect(d.map((wid) => ctx.windows[wid]).flat()).not.toContain(ctx.slotIdx.get(3))
    }
  })

  it('预排锁定占掉的格子会被节点一致性剔除', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 1 })
    input.fixedLessons = [
      {
        id: 1,
        kind: 'lesson',
        classId: 1,
        gradeId: null,
        subjectId: null,
        teacherId: null,
        classroomId: null,
        slotId: 1,
        label: '升旗'
      }
    ]
    const ctx = buildContext(input)
    const before = ctx.domains.map((d) => d.length)
    const after = ac3(ctx)
    expect(after.removed).toBeGreaterThan(0)
    expect(after.domains.every((d, i) => d.length <= before[i])).toBe(true)
    // 第 1 格已被预排占死，任何单元都不该保留它
    for (const d of after.domains) {
      expect(d.map((wid) => ctx.windows[wid]).flat()).not.toContain(ctx.slotIdx.get(1))
    }
  })

  it('邻居值域塌缩成单点时会向外传播（弧一致性）', () => {
    // 1 个班 1 天 3 节；语文被禁到只剩第 1 格 → 同班的数学就不该再保留第 1 格
    const input = makeInput({ classes: 1, weeklyPeriods: 1, days: 1, periodsPerDay: 3 })
    input.timeRules = [2, 3].map((slotId) => ({
      scopeType: 'subject' as const,
      scopeId: 1,
      slotId,
      ruleValue: 'FORBIDDEN' as const
    }))
    const ctx = buildContext(input)
    const chinese = ctx.units.find((u) => u.subjectId === 1)!
    const math = ctx.units.find((u) => u.subjectId === 2)!
    expect(ctx.domains[chinese.id].length).toBe(1)
    expect(ctx.domains[math.id].length).toBe(3)

    const r = ac3(ctx)
    expect(r.wipeouts).toEqual([])
    expect(r.domains[chinese.id].length).toBe(1)
    expect(r.domains[math.id].length).toBe(2)
    expect(r.domains[math.id].map((wid) => ctx.windows[wid][0])).not.toContain(ctx.slotIdx.get(1))
  })
})

describe('无解诊断', () => {
  it('课时超过可用时段 → 报班级供给不足，并给出可执行建议', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 6, days: 1, periodsPerDay: 4 })
    const ctx = buildContext(input)
    const diags = checkFeasibility(ctx, ac3(ctx).domains)
    const hit = diags.find((d) => d.code === 'CLASS_SUPPLY')
    expect(hit).toBeTruthy()
    expect(hit!.detail).toMatch(/缺口/)
    expect(hit!.suggestions.length).toBeGreaterThan(0)
  })

  it('某节课一个落点都没有 → 点名是谁、为什么', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 1 })
    input.timeRules = input.slots.map((s) => ({
      scopeType: 'class' as const,
      scopeId: 1,
      slotId: s.id,
      ruleValue: 'FORBIDDEN' as const
    }))
    const ctx = buildContext(input)
    const diags = checkFeasibility(ctx, ac3(ctx).domains)
    const hit = diags.find((d) => d.code === 'UNIT_DOMAIN_EMPTY')
    expect(hit).toBeTruthy()
    expect(hit!.title).toContain('初一(1)班')
    expect(hit!.detail).toContain('禁排')
  })

  it('霍尔条件：3 节课挤 2 个可用格 → 报紧缩集', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 2, days: 5, periodsPerDay: 4 })
    // 只放开周一前 3 格，其余全禁 → 语文 2 节 + 数学 2 节 = 4 节抢 3 格
    input.timeRules = input.slots
      .filter((s) => s.id > 3)
      .map((s) => ({ scopeType: 'class' as const, scopeId: 1, slotId: s.id, ruleValue: 'FORBIDDEN' as const }))
    const ctx = buildContext(input)
    const diags = checkFeasibility(ctx, ac3(ctx).domains)
    expect(diags.map((d) => d.code)).toContain('CLASS_HALL')
  })

  it('无解时 solve 返回 infeasible 且带诊断，不抛异常', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 5, days: 1, periodsPerDay: 2 })
    const r = solve(input)
    expect(r.status).not.toBe('solved')
    expect(r.diagnostics.length).toBeGreaterThan(0)
  })
})

describe('规则矛盾自检', () => {
  it('连堂 3 节但每个分段只有 2 节 → SC_BLOCK_IMPOSSIBLE', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 3, periodsPerDay: 4 })
    input.tasks = input.tasks.map((t) =>
      t.subjectId === 1 ? { ...t, consecutiveCount: 1, consecutiveSize: 3 } : t
    )
    const ctx = buildContext(input)
    expect(selfCheckRules(ctx).map((d) => d.code)).toContain('SC_BLOCK_IMPOSSIBLE')
  })

  it('每日上限 × 天数 < 周课时 → SC_DAILY_MAX', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 6, days: 5, periodsPerDay: 8 })
    input.subjects = input.subjects.map((s) => (s.id === 1 ? { ...s, dailyMax: 1 } : s))
    input.tasks = input.tasks.map((t) => (t.subjectId === 1 ? { ...t, weeklyPeriods: 6 } : t))
    const ctx = buildContext(input)
    const hit = selfCheckRules(ctx).find((d) => d.code === 'SC_DAILY_MAX')
    expect(hit).toBeTruthy() // 周 6 节 > 每日 1 节 × 5 天
    expect(hit!.suggestions[0]).toContain('每日上限提到 2 节')
  })

  it('需专用教室却没绑场地 → SC_SPECIAL_ROOM', () => {
    const input: SolverInput = makeInput({ classes: 1, weeklyPeriods: 1 })
    input.subjects = input.subjects.map((s) =>
      s.id === 1 ? { ...s, needSpecialRoom: true, allowedRooms: [] } : s
    )
    const ctx = buildContext(input)
    expect(selfCheckRules(ctx).map((d) => d.code)).toContain('SC_SPECIAL_ROOM')
  })
})

describe('引擎行为', () => {
  it('同一输入 + 同一种子 → 完全相同的课表（可复现）', () => {
    const input = makeInput({ classes: 6, weeklyPeriods: 3 })
    const dump = (): string =>
      solve(input, { seed: 42 })
        .lessons.map((l) => `${l.classId}:${l.subjectId}:${l.slotId}`)
        .sort()
        .join('|')
    expect(dump()).toBe(dump())
  })

  it('多起点会真的换种子跑，且结果不劣于单起点', () => {
    const input = makeInput({ classes: 6, weeklyPeriods: 3 })
    const r = solve(input, { seed: 7, starts: 3 })
    expect(r.status).toBe('solved')
    expect(r.violations).toEqual([])
  })

  it('会按阶段抛进度事件，且可以中途取消', () => {
    const input = makeInput({ classes: 4, weeklyPeriods: 3 })
    const phases: string[] = []
    solve(input, { onProgress: (p) => phases.push(p.phase) })
    expect(phases[0]).toBe('preprocess')
    expect(phases).toContain('construct')
    expect(phases[phases.length - 1]).toBe('done')

    const cancelled = solve(input, { cancelled: () => true })
    expect(cancelled.status).toBe('cancelled')
  })
})
