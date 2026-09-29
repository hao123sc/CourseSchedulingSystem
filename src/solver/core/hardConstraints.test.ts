/**
 * M3 验收项：构造单元测试**逐条**覆盖 H1~H11（docs/04 §1.2）。
 *
 * 每条硬约束两个方向都测：
 *   正向 —— 引擎排出来的解里，这条约束的违反数必须为 0
 *   反向 —— 手工捏一个违反它的解，校验器必须以对应编号抓出来
 * 反向用例很关键：只测正向的话，校验器写空了也能"全绿"。
 */
import { describe, expect, it } from 'vitest'
import { makeInput } from '../testing/fixture'
import { buildContext } from './context'
import { verifyHardConstraints } from './verify'
import { solve } from '../solve'
import type { Solution } from '../model/solution'
import type { SolverContext } from './context'
import type { SolverInput } from '../model/types'

function handMade(
  entries: { unitId: number; slotIds: number[]; roomId?: number | null }[]
): Solution {
  return {
    assignments: new Map(
      entries.map((e) => [
        e.unitId,
        { unitId: e.unitId, slotId: e.slotIds[0], slotIds: e.slotIds, roomId: e.roomId ?? null }
      ])
    ),
    unplaced: [],
    seed: 1
  }
}

const codes = (vs: { code: string }[]): string[] => vs.map((v) => v.code)

/** 找第一个满足条件的单元 id */
function findUnit(ctx: SolverContext, pred: (u: SolverContext['units'][number]) => boolean): number {
  const u = ctx.units.find(pred)
  if (!u) throw new Error('测试夹具里找不到符合条件的单元')
  return u.id
}

function sportsInput(concurrent = 1, seats = 300): SolverInput {
  const input = makeInput({ classes: 2, weeklyPeriods: 1 })
  input.rooms = input.rooms.map((r) =>
    r.id === 201 ? { ...r, concurrentCapacity: concurrent, capacity: seats } : r
  )
  input.subjects.push({
    id: 3,
    name: '体育',
    shortName: '体',
    importance: 3,
    needSpecialRoom: true,
    dailyMax: 1,
    weekSpread: 'spread',
    allowedRooms: [{ classroomId: 201, slotsTaken: 1, priority: 0 }]
  })
  input.teachers.push({ id: 13, name: '王老师', maxWeeklyPeriods: 20, building: null, subjectIds: [3] })
  for (const c of input.classes) {
    input.tasks.push({
      id: 100 + c.id,
      classId: c.id,
      subjectId: 3,
      teacherId: 13,
      weeklyPeriods: 1,
      consecutiveCount: 0,
      consecutiveSize: 1,
      weekMode: 'all',
      mergeGroupId: null,
      fixedRoomId: null
    })
  }
  return input
}

describe('H1 班级唯一', () => {
  it('引擎排出的解不会让同一个班在同一时段上两节课', () => {
    const r = solve(makeInput())
    expect(codes(r.violations)).not.toContain('H1')
    expect(r.status).toBe('solved')
  })

  it('手工把同班两节课塞进同一格 → 校验器报 H1', () => {
    const ctx = buildContext(makeInput())
    const a = findUnit(ctx, (u) => u.classIds.includes(1) && u.subjectId === 1)
    const b = findUnit(ctx, (u) => u.classIds.includes(1) && u.subjectId === 2)
    const v = verifyHardConstraints(
      ctx,
      handMade([
        { unitId: a, slotIds: [1] },
        { unitId: b, slotIds: [1] }
      ])
    )
    expect(codes(v)).toContain('H1')
  })
})

describe('H2 教师唯一', () => {
  it('引擎不会让同一位教师同时出现在两个班', () => {
    const r = solve(makeInput({ classes: 4, weeklyPeriods: 3 }))
    expect(codes(r.violations)).not.toContain('H2')
  })

  it('手工让张老师在同一格带两个班 → 报 H2', () => {
    const ctx = buildContext(makeInput())
    const a = findUnit(ctx, (u) => u.classIds.includes(1) && u.teacherIds.includes(11))
    const b = findUnit(ctx, (u) => u.classIds.includes(2) && u.teacherIds.includes(11))
    const v = verifyHardConstraints(
      ctx,
      handMade([
        { unitId: a, slotIds: [1] },
        { unitId: b, slotIds: [1] }
      ])
    )
    expect(codes(v)).toContain('H2')
  })
})

describe('H3 场地并发容量', () => {
  it('操场同时可上 2 个班时，两个班的体育可以同格', () => {
    const r = solve(sportsInput(2))
    expect(codes(r.violations)).not.toContain('H3')
    expect(r.status).toBe('solved')
  })

  it('操场只能上 1 个班时，引擎会把两个班的体育错开', () => {
    const r = solve(sportsInput(1))
    expect(codes(r.violations)).not.toContain('H3')
    const slots = [...r.solution.assignments.values()]
      .filter((a) => r.ctx.units[a.unitId].subjectId === 3)
      .map((a) => a.slotId)
    expect(new Set(slots).size).toBe(slots.length)
  })

  it('手工把两个班塞进独占场地的同一格 → 报 H3', () => {
    const ctx = buildContext(sportsInput(1))
    const a = findUnit(ctx, (u) => u.subjectId === 3 && u.classIds.includes(1))
    const b = findUnit(ctx, (u) => u.subjectId === 3 && u.classIds.includes(2))
    const v = verifyHardConstraints(
      ctx,
      handMade([
        { unitId: a, slotIds: [1], roomId: 201 },
        { unitId: b, slotIds: [1], roomId: 201 }
      ])
    )
    expect(codes(v)).toContain('H3')
  })
})

describe('H3b 人数容量', () => {
  it('座位数不足的场地会被剔出候选，引擎不会往里排', () => {
    const r = solve(sportsInput(2, 10)) // 操场只剩 10 个座位，坐不下 45 人
    expect(codes(r.violations)).not.toContain('H3b')
    // 没有任何可用场地 → 这门课排不出来，且必须给出诊断
    expect(r.status).not.toBe('solved')
    expect(r.diagnostics.length).toBeGreaterThan(0)
  })

  it('手工把 45 人的班塞进 10 座的场地 → 报 H3b', () => {
    const ctx = buildContext(sportsInput(2, 10))
    const a = findUnit(ctx, (u) => u.subjectId === 3)
    const v = verifyHardConstraints(ctx, handMade([{ unitId: a, slotIds: [1], roomId: 201 }]))
    expect(codes(v)).toContain('H3b')
  })
})

describe('H4 课时守恒', () => {
  it('每条任务都恰好排满周课时', () => {
    const r = solve(makeInput({ classes: 3, weeklyPeriods: 4 }))
    expect(codes(r.violations)).not.toContain('H4')
    expect(r.unplaced).toEqual([])
  })

  it('预排锁定的课时要从待排节数里扣掉，不能重复排', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 3 })
    input.fixedLessons = [
      {
        id: 1,
        kind: 'lesson',
        classId: 1,
        gradeId: null,
        subjectId: 1,
        teacherId: 11,
        classroomId: 101,
        slotId: 1,
        label: '语文(预排)'
      }
    ]
    const r = solve(input)
    // 语文周 3 节，已钉死 1 节 → 引擎只该再排 2 节
    const placed = r.lessons.filter((l) => l.subjectId === 1).length
    expect(placed).toBe(2)
    expect(codes(r.violations)).not.toContain('H4')
    expect(r.status).toBe('solved')
  })

  it('少排一节 → 报 H4', () => {
    const ctx = buildContext(makeInput({ classes: 1, weeklyPeriods: 2 }))
    const v = verifyHardConstraints(ctx, handMade([{ unitId: 0, slotIds: [1] }]))
    expect(codes(v)).toContain('H4')
  })
})

describe('H5 禁排时段', () => {
  it('引擎不会往禁排格里排课', () => {
    const input = makeInput({ classes: 2, weeklyPeriods: 2 })
    input.timeRules = [1, 2, 3, 4].map((slotId) => ({
      scopeType: 'class' as const,
      scopeId: 1,
      slotId,
      ruleValue: 'FORBIDDEN' as const
    }))
    const r = solve(input)
    expect(codes(r.violations)).not.toContain('H5')
    const bad = r.lessons.filter((l) => l.classId === 1 && l.slotId <= 4)
    expect(bad).toEqual([])
  })

  it('手工排进禁排格 → 报 H5', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 1 })
    input.timeRules = [{ scopeType: 'global', scopeId: null, slotId: 1, ruleValue: 'FORBIDDEN' }]
    const ctx = buildContext(input)
    const v = verifyHardConstraints(ctx, handMade([{ unitId: 0, slotIds: [1] }]))
    expect(codes(v)).toContain('H5')
  })
})

describe('H6 教室匹配', () => {
  it('需专用场地的课只会落在允许的场地上', () => {
    const r = solve(sportsInput(2))
    expect(codes(r.violations)).not.toContain('H6')
    const pe = r.lessons.filter((l) => l.subjectId === 3)
    expect(pe.every((l) => l.classroomId === 201)).toBe(true)
  })

  it('手工把体育课排进普通教室 → 报 H6', () => {
    const ctx = buildContext(sportsInput(2))
    const a = findUnit(ctx, (u) => u.subjectId === 3)
    const v = verifyHardConstraints(ctx, handMade([{ unitId: a, slotIds: [1], roomId: 101 }]))
    expect(codes(v)).toContain('H6')
  })
})

describe('H7 预排锁定不可侵占', () => {
  it('kind=block 只摘资源、不产生课，引擎会绕开它', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 2 })
    input.fixedLessons = [
      {
        id: 1,
        kind: 'block',
        classId: null,
        gradeId: null,
        subjectId: null,
        teacherId: 11,
        classroomId: null,
        slotId: 1,
        label: '张老师教研'
      }
    ]
    const r = solve(input)
    expect(codes(r.violations)).not.toContain('H7')
    // 张老师带的语文不会落在第 1 格；且 block 不产生课
    expect(r.lessons.filter((l) => l.teacherId === 11 && l.slotId === 1)).toEqual([])
    expect(r.lessons.length).toBe(4)
  })

  it('手工排进被预排钉死的格子 → 报 H7', () => {
    const input = makeInput({ classes: 1, weeklyPeriods: 1 })
    input.fixedLessons = [
      {
        id: 1,
        kind: 'lesson',
        classId: 1,
        gradeId: null,
        subjectId: 2,
        teacherId: 12,
        classroomId: 101,
        slotId: 1,
        label: '班会'
      }
    ]
    const ctx = buildContext(input)
    const a = findUnit(ctx, (u) => u.classIds.includes(1))
    const v = verifyHardConstraints(ctx, handMade([{ unitId: a, slotIds: [1] }]))
    expect(codes(v)).toContain('H7')
  })
})

describe('H8 硬互斥组', () => {
  const mutexInput = (): SolverInput => {
    const input = makeInput({ classes: 2, weeklyPeriods: 2 })
    input.constraintGroups = [
      {
        id: 1,
        groupType: 'teacher_mutex',
        name: '年级组会（张李不得同时有课）',
        hardness: 'hard',
        maxConcurrent: 1,
        scopeNote: null,
        members: [
          { memberType: 'teacher', memberId: 11 },
          { memberType: 'teacher', memberId: 12 }
        ]
      }
    ]
    return input
  }

  it('互斥组内的教师不会被排在同一时段', () => {
    const r = solve(mutexInput())
    expect(codes(r.violations)).not.toContain('H8')
    const bySlot = new Map<number, Set<number>>()
    for (const l of r.lessons) {
      const set = bySlot.get(l.slotId) ?? new Set<number>()
      set.add(l.teacherId!)
      bySlot.set(l.slotId, set)
    }
    for (const set of bySlot.values()) expect(set.size).toBeLessThanOrEqual(1)
  })

  it('手工让互斥组两位教师同格 → 报 H8', () => {
    const ctx = buildContext(mutexInput())
    const a = findUnit(ctx, (u) => u.teacherIds.includes(11))
    const b = findUnit(ctx, (u) => u.teacherIds.includes(12))
    const v = verifyHardConstraints(
      ctx,
      handMade([
        { unitId: a, slotIds: [1] },
        { unitId: b, slotIds: [1] }
      ])
    )
    expect(codes(v)).toContain('H8')
  })
})

describe('H9 拼合 / 同时上课', () => {
  const mergeInput = (weeklyB = 2): SolverInput => {
    const input = makeInput({ classes: 2, weeklyPeriods: 2 })
    // 两个班的语文要求同时上课
    input.tasks = input.tasks.map((t) =>
      t.subjectId === 1 && t.classId === 2 ? { ...t, weeklyPeriods: weeklyB } : t
    )
    input.constraintGroups = [
      {
        id: 1,
        groupType: 'simultaneous',
        name: '初一语文同步',
        hardness: 'hard',
        maxConcurrent: null,
        scopeNote: null,
        members: [
          { memberType: 'task', memberId: input.tasks.find((t) => t.classId === 1 && t.subjectId === 1)!.id },
          { memberType: 'task', memberId: input.tasks.find((t) => t.classId === 2 && t.subjectId === 1)!.id }
        ]
      }
    ]
    return input
  }

  it('组内任务被排到同一批时段', () => {
    const r = solve(mergeInput())
    expect(codes(r.violations)).not.toContain('H9')
    const a = r.lessons.filter((l) => l.classId === 1 && l.subjectId === 1).map((l) => l.slotId).sort()
    const b = r.lessons.filter((l) => l.classId === 2 && l.subjectId === 1).map((l) => l.slotId).sort()
    expect(a).toEqual(b)
  })

  it('组内课时数不等时，多出来的那节落在别处 → 校验器报 H9', () => {
    const input = mergeInput(3)
    const r = solve(input)
    expect(codes(r.violations)).toContain('H9')
  })
})

describe('H10 连堂完整', () => {
  const blockInput = (): SolverInput => {
    const input = makeInput({ classes: 1, weeklyPeriods: 2 })
    input.tasks = input.tasks.map((t) =>
      t.subjectId === 1 ? { ...t, consecutiveCount: 1, consecutiveSize: 2 } : t
    )
    return input
  }

  it('连堂块被排成同日相邻、不跨上下午分段', () => {
    const r = solve(blockInput())
    expect(codes(r.violations)).not.toContain('H10')
    const block = r.lessons.filter((l) => l.subjectId === 1).sort((x, y) => x.slotId - y.slotId)
    expect(block.length).toBe(2)
    const s1 = r.ctx.slots[r.ctx.slotIdx.get(block[0].slotId)!]
    const s2 = r.ctx.slots[r.ctx.slotIdx.get(block[1].slotId)!]
    expect(s1.dayOfWeek).toBe(s2.dayOfWeek)
    expect(s1.segment).toBe(s2.segment)
    expect(s2.periodIndex - s1.periodIndex).toBe(1)
  })

  it('手工把连堂块拆到两天 → 报 H10', () => {
    const ctx = buildContext(blockInput())
    const a = findUnit(ctx, (u) => u.size === 2)
    const v = verifyHardConstraints(ctx, handMade([{ unitId: a, slotIds: [1, 5] }]))
    expect(codes(v)).toContain('H10')
  })
})

describe('H11 走班学生冲突', () => {
  it('没有走班数据时恒不报警', () => {
    const r = solve(makeInput())
    expect(codes(r.violations)).not.toContain('H11')
  })

  it('两个虚拟班共享同一批学生且同格 → 报 H11', () => {
    const ctx = buildContext(makeInput())
    const a = findUnit(ctx, (u) => u.classIds.includes(1))
    const b = findUnit(ctx, (u) => u.classIds.includes(2))
    const v = verifyHardConstraints(
      ctx,
      handMade([
        { unitId: a, slotIds: [1] },
        { unitId: b, slotIds: [1] }
      ]),
      { studentGroups: new Map([[1, [7]], [2, [7]]]) }
    )
    expect(codes(v)).toContain('H11')
  })
})
