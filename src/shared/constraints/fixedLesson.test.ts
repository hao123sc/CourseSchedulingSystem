import { describe, expect, it } from 'vitest'
import {
  checkFixedLessonAgainst,
  detectFixedLessonConflicts,
  type FixedLessonContext,
  type FixedLessonLike
} from './fixedLesson'

/** 初一年级(id=1) 有 3 个班：11/12/13；田径场(900) 并发 4，普通教室(901) 并发 1 */
const ctx: FixedLessonContext = {
  classGrade: new Map([
    [11, 1],
    [12, 1],
    [13, 1]
  ]),
  gradeClasses: new Map([[1, [11, 12, 13]]]),
  roomConcurrency: new Map([
    [900, 4],
    [901, 1]
  ])
}

const f = (p: Partial<FixedLessonLike>): FixedLessonLike => ({
  classId: null,
  gradeId: null,
  teacherId: null,
  classroomId: null,
  slotId: 1,
  ...p
})

describe('预排锁定冲突判定（H7 录入守门）', () => {
  it('自洽的一组占位无冲突', () => {
    const list = [
      f({ gradeId: 1, slotId: 1, label: '升旗' }),
      f({ classId: 11, slotId: 5, label: '班会' })
    ]
    expect(detectFixedLessonConflicts(list, ctx)).toHaveLength(0)
  })

  it('既没班级也没年级 → invalid', () => {
    const out = detectFixedLessonConflicts([f({})], ctx)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('invalid')
  })

  it('同班同时段两个占位 → class 冲突', () => {
    const out = detectFixedLessonConflicts(
      [f({ classId: 11, slotId: 3 }), f({ classId: 11, slotId: 3 })],
      ctx
    )
    expect(out.some((c) => c.kind === 'class')).toBe(true)
  })

  it('年级级占位会展开到全年级，与班级级占位相撞', () => {
    const out = detectFixedLessonConflicts(
      [f({ gradeId: 1, slotId: 3 }), f({ classId: 12, slotId: 3 })],
      ctx
    )
    const conflict = out.find((c) => c.kind === 'class')
    expect(conflict).toBeDefined()
    expect(conflict?.indexes).toEqual([0, 1])
  })

  it('同一教师同时段分身 → teacher 冲突', () => {
    const out = detectFixedLessonConflicts(
      [f({ classId: 11, teacherId: 7, slotId: 2 }), f({ classId: 12, teacherId: 7, slotId: 2 })],
      ctx
    )
    expect(out.some((c) => c.kind === 'teacher')).toBe(true)
  })

  it('不同时段的同一教师不冲突', () => {
    const out = detectFixedLessonConflicts(
      [f({ classId: 11, teacherId: 7, slotId: 2 }), f({ classId: 12, teacherId: 7, slotId: 3 })],
      ctx
    )
    expect(out).toHaveLength(0)
  })

  it('并发容量 4 的田径场可容 3 个班，第 5 个班位超限', () => {
    const ok = detectFixedLessonConflicts(
      [
        f({ classId: 11, classroomId: 900, slotId: 4 }),
        f({ classId: 12, classroomId: 900, slotId: 4 }),
        f({ classId: 13, classroomId: 900, slotId: 4 })
      ],
      ctx
    )
    expect(ok.filter((c) => c.kind === 'room')).toHaveLength(0)

    // 整年级(3 班) + 1 个班 = 4 个班位，恰好占满
    const full = detectFixedLessonConflicts([f({ gradeId: 1, classroomId: 900, slotId: 6 })], ctx)
    expect(full.filter((c) => c.kind === 'room')).toHaveLength(0)
  })

  it('普通教室并发=1，两个班同时段抢同一间 → room 冲突', () => {
    const out = detectFixedLessonConflicts(
      [
        f({ classId: 11, classroomId: 901, slotId: 4 }),
        f({ classId: 12, classroomId: 901, slotId: 4 })
      ],
      ctx
    )
    const room = out.find((c) => c.kind === 'room')
    expect(room).toBeDefined()
    expect(room?.message).toContain('并发容量不足')
  })

  it('checkFixedLessonAgainst 只回报与候选相关的冲突', () => {
    const existing = [
      f({ id: 1, classId: 11, slotId: 1 }),
      f({ id: 2, classId: 12, slotId: 1 }),
      f({ id: 3, classId: 12, slotId: 1 }) // 已有的一处历史冲突
    ]
    const out = checkFixedLessonAgainst(f({ classId: 11, slotId: 1 }), existing, ctx)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('class')
  })

  it('checkFixedLessonAgainst 编辑自身时不与旧值相撞', () => {
    const existing = [f({ id: 1, classId: 11, slotId: 1 })]
    const out = checkFixedLessonAgainst(f({ id: 1, classId: 11, slotId: 1 }), existing, ctx)
    expect(out).toHaveLength(0)
  })
})

describe('kind=block 仅占用（migration 006）', () => {
  const blk = (p: Partial<FixedLessonLike>): FixedLessonLike => f({ kind: 'block', ...p })

  it('只占教室、不绑班级 —— 合法', () => {
    expect(detectFixedLessonConflicts([blk({ classroomId: 901, slotId: 1 })], ctx)).toHaveLength(0)
  })

  it('只占教师、不绑班级 —— 合法', () => {
    expect(detectFixedLessonConflicts([blk({ teacherId: 7, slotId: 1 })], ctx)).toHaveLength(0)
  })

  it('既不占教师也不占教室 → invalid', () => {
    const out = detectFixedLessonConflicts([blk({ slotId: 1 })], ctx)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('invalid')
    expect(out[0].message).toContain('至少要指定')
  })

  it('仅占用却绑了班级 → invalid', () => {
    const out = detectFixedLessonConflicts([blk({ classId: 11, classroomId: 901 })], ctx)
    expect(out.some((c) => c.kind === 'invalid' && c.message.includes('不产生课'))).toBe(true)
  })

  it('不占班级：整年级预排课与同格的教室 block 互不干扰班级维度', () => {
    const out = detectFixedLessonConflicts(
      [blk({ classroomId: 901, slotId: 9 }), f({ gradeId: 1, slotId: 9 })],
      ctx
    )
    expect(out.filter((c) => c.kind === 'class')).toHaveLength(0)
  })

  it('场地 block 独占：并发 4 的田径场被占用后，一个班也排不进去', () => {
    const out = detectFixedLessonConflicts(
      [blk({ classroomId: 900, slotId: 4 }), f({ classId: 11, classroomId: 900, slotId: 4 })],
      ctx
    )
    const room = out.find((c) => c.kind === 'room')
    expect(room).toBeDefined()
    expect(room?.message).toContain('维护/外借')
    expect(room?.indexes).toEqual([0, 1])
  })

  it('场地 block 不影响其它时段与其它场地', () => {
    const out = detectFixedLessonConflicts(
      [
        blk({ classroomId: 900, slotId: 4 }),
        f({ classId: 11, classroomId: 900, slotId: 5 }),
        f({ classId: 12, classroomId: 901, slotId: 4 })
      ],
      ctx
    )
    expect(out).toHaveLength(0)
  })

  it('教师 block 挡住同一教师的预排课，文案点明原因', () => {
    const out = detectFixedLessonConflicts(
      [blk({ teacherId: 7, slotId: 2 }), f({ classId: 11, teacherId: 7, slotId: 2 })],
      ctx
    )
    const t = out.find((c) => c.kind === 'teacher')
    expect(t).toBeDefined()
    expect(t?.message).toContain('开会')
  })

  it('增量校验：往被占用的机房里塞课会被当场拦下', () => {
    const existing = [blk({ id: 1, classroomId: 901, slotId: 3 })]
    const out = checkFixedLessonAgainst(
      f({ classId: 11, classroomId: 901, slotId: 3 }),
      existing,
      ctx
    )
    expect(out.some((c) => c.kind === 'room')).toBe(true)
  })

  it('未声明 kind 的历史数据仍按预排课判定', () => {
    const out = detectFixedLessonConflicts([f({ classroomId: 901, slotId: 3 })], ctx)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('invalid')
    expect(out[0].message).toContain('预排课必须指定')
  })
})

/**
 * 课时守恒 H4：预排是钉死的，超出教学任务周课时的部分在排课阶段无论如何消化不掉。
 * 11 班语文(科目 5) 一周 2 节、数学(科目 6) 一周 1 节；12 班没开语文。
 */
const quotaCtx: FixedLessonContext = {
  ...ctx,
  subjectQuota: new Map([
    ['11:5', 2],
    ['11:6', 1],
    ['13:5', 2]
  ])
}

describe('预排锁定课时守恒（H4）', () => {
  const lesson = (subjectId: number, slotId: number, classId = 11): FixedLessonLike =>
    f({ kind: 'lesson', classId, subjectId, slotId })

  it('排到刚好等于周课时不算冲突', () => {
    const out = detectFixedLessonConflicts([lesson(5, 1), lesson(5, 2)], quotaCtx)
    expect(out).toHaveLength(0)
  })

  it('多排一节就报超额，并把同班同科的每一节都圈出来给人删', () => {
    const out = detectFixedLessonConflicts([lesson(5, 1), lesson(5, 2), lesson(5, 3)], quotaCtx)
    const q = out.find((c) => c.kind === 'quota')
    expect(q).toBeDefined()
    expect(q?.message).toContain('预排了 3 节')
    expect(q?.message).toContain('只有 2 节')
    expect(q?.indexes).toEqual([0, 1, 2])
  })

  it('各科分别计数，不会串味', () => {
    const out = detectFixedLessonConflicts([lesson(5, 1), lesson(5, 2), lesson(6, 3)], quotaCtx)
    expect(out.filter((c) => c.kind === 'quota')).toHaveLength(0)
  })

  it('年级级占位按它覆盖的每个班分别计入课时', () => {
    // 初一整年级排 1 节语文 → 11 班和 13 班各占 1 节；11 班自己再排 2 节就超了
    const out = detectFixedLessonConflicts(
      [f({ kind: 'lesson', gradeId: 1, subjectId: 5, slotId: 1 }), lesson(5, 2), lesson(5, 3)],
      quotaCtx
    )
    const q = out.find((c) => c.kind === 'quota')
    expect(q?.message).toContain('预排了 3 节')
  })

  it('没有教学任务的组合不归课时守恒管（讲座、代课这类课表外安排）', () => {
    const out = detectFixedLessonConflicts(
      [lesson(5, 1, 12), lesson(5, 2, 12), lesson(5, 3, 12)],
      quotaCtx
    )
    expect(out.filter((c) => c.kind === 'quota')).toHaveLength(0)
  })

  it('升旗、班会这类无学科占位不占任何课时', () => {
    const out = detectFixedLessonConflicts(
      [f({ kind: 'lesson', classId: 11, slotId: 1, label: '班会' })],
      quotaCtx
    )
    expect(out.filter((c) => c.kind === 'quota')).toHaveLength(0)
  })

  it('仅占用（block）不计课时', () => {
    const out = detectFixedLessonConflicts(
      [lesson(5, 1), lesson(5, 2), f({ kind: 'block', teacherId: 9, slotId: 4 })],
      quotaCtx
    )
    expect(out.filter((c) => c.kind === 'quota')).toHaveLength(0)
  })

  it('没提供配额表时整段跳过，旧调用方行为不变', () => {
    const out = detectFixedLessonConflicts([lesson(5, 1), lesson(5, 2), lesson(5, 3)], ctx)
    expect(out.filter((c) => c.kind === 'quota')).toHaveLength(0)
  })

  it('增量校验：排满之后再加一节会被当场拦下', () => {
    const existing = [lesson(5, 1), lesson(5, 2)].map((x, i) => ({ ...x, id: i + 1 }))
    const out = checkFixedLessonAgainst(lesson(5, 3), existing, quotaCtx)
    expect(out.some((c) => c.kind === 'quota')).toBe(true)
  })
})
