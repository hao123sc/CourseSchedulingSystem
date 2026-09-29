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
    const full = detectFixedLessonConflicts(
      [f({ gradeId: 1, classroomId: 900, slotId: 6 })],
      ctx
    )
    expect(full.filter((c) => c.kind === 'room')).toHaveLength(0)
  })

  it('普通教室并发=1，两个班同时段抢同一间 → room 冲突', () => {
    const out = detectFixedLessonConflicts(
      [f({ classId: 11, classroomId: 901, slotId: 4 }), f({ classId: 12, classroomId: 901, slotId: 4 })],
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
