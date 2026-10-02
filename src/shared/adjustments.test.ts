import { describe, expect, it } from 'vitest'
import {
  AdjustmentHistory,
  createAdjustmentCommand,
  detectAdjustmentConflicts,
  detectSwapConflicts,
  validAdjustmentTargets,
  type AdjustmentLesson
} from './adjustments'

const lessons: AdjustmentLesson[] = [
  {
    id: 1,
    classId: 10,
    teacherId: 20,
    classroomId: 30,
    slotId: 1,
    isLocked: false,
    consecutiveGroup: null
  },
  {
    id: 2,
    classId: 11,
    teacherId: 21,
    classroomId: 31,
    slotId: 2,
    isLocked: false,
    consecutiveGroup: null
  },
  {
    id: 3,
    classId: 12,
    teacherId: 20,
    classroomId: 32,
    slotId: 2,
    isLocked: false,
    consecutiveGroup: null
  },
  {
    id: 4,
    classId: 13,
    teacherId: 22,
    classroomId: 33,
    slotId: 4,
    isLocked: true,
    consecutiveGroup: null
  },
  {
    id: 5,
    classId: 10,
    teacherId: 23,
    classroomId: 30,
    slotId: 5,
    isLocked: false,
    consecutiveGroup: null
  }
]

describe('M6 local adjustments', () => {
  it('detects class, teacher and locked conflicts locally', () => {
    expect(
      detectAdjustmentConflicts(lessons, { lessonId: 1, fromSlotId: 1, toSlotId: 2 }).map(
        (x) => x.code
      )
    ).toEqual(['TEACHER'])
    expect(
      detectAdjustmentConflicts(lessons, { lessonId: 4, fromSlotId: 4, toSlotId: 1 })[0].code
    ).toBe('LOCKED')
  })

  it('detects valid and conflicting two-way swaps', () => {
    // Lesson 1 (Class 10, Teacher 20, Slot 1) 与 Lesson 5 (Class 10, Teacher 23, Slot 5) 对调
    // Teacher 20 在 slot 5 无课，Teacher 23 在 slot 1 无课 -> 无冲突
    expect(detectSwapConflicts(lessons, 1, 5)).toHaveLength(0)

    // 与锁定课对调 -> 报 LOCKED
    expect(detectSwapConflicts(lessons, 1, 4)[0].code).toBe('LOCKED')

    // 与 Lesson 3 对调 (Teacher 20 自己在 slot 2 的课)
    expect(detectSwapConflicts(lessons, 1, 3)).toHaveLength(0)
  })

  it('uses the same conflict rules to calculate highlighted targets including swaps', () => {
    // 班级 10 视图下，Lesson 1 可移入空闲 slot (3, 4)，也可与已有的 Lesson 5 (slot 5) 对调
    expect([
      ...validAdjustmentTargets(lessons, 1, [1, 2, 3, 4, 5], { view: 'class', targetId: 10 })
    ]).toEqual([3, 4, 5])
    expect(validAdjustmentTargets(lessons, 4, [1, 2, 3, 4, 5]).size).toBe(0)
  })

  it('supports 50-step undo and redo semantics for both moves and swaps', () => {
    const current = lessons.map((lesson) => ({ ...lesson }))
    const history = new AdjustmentHistory(50)

    // 单课移动测试
    const moveCommand = createAdjustmentCommand({
      actionType: 'move',
      lessonId: 1,
      fromSlotId: 1,
      toSlotId: 3
    })
    history.execute(moveCommand, current)
    expect(current[0].slotId).toBe(3)
    expect(history.undo(current)).toBe(true)
    expect(current[0].slotId).toBe(1)
    expect(history.redo(current)).toBe(true)
    expect(current[0].slotId).toBe(3)

    // 两课对调测试 (Lesson 1 at 3, Lesson 5 at 5)
    const swapCommand = createAdjustmentCommand({
      actionType: 'swap',
      lessonId: 1,
      fromSlotId: 3,
      toSlotId: 5,
      swapWithLessonId: 5
    })
    history.execute(swapCommand, current)
    expect(current.find((l) => l.id === 1)?.slotId).toBe(5)
    expect(current.find((l) => l.id === 5)?.slotId).toBe(3)

    expect(history.undo(current)).toBe(true)
    expect(current.find((l) => l.id === 1)?.slotId).toBe(3)
    expect(current.find((l) => l.id === 5)?.slotId).toBe(5)

    expect(history.redo(current)).toBe(true)
    expect(current.find((l) => l.id === 1)?.slotId).toBe(5)
    expect(current.find((l) => l.id === 5)?.slotId).toBe(3)
  })
})
