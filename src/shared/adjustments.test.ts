import { describe, expect, it } from 'vitest'
import { AdjustmentHistory, createAdjustmentCommand, detectAdjustmentConflicts, type AdjustmentLesson } from './adjustments'

const lessons: AdjustmentLesson[] = [
  { id: 1, classId: 10, teacherId: 20, classroomId: 30, slotId: 1, isLocked: false, consecutiveGroup: null },
  { id: 2, classId: 11, teacherId: 21, classroomId: 31, slotId: 2, isLocked: false, consecutiveGroup: null },
  { id: 3, classId: 12, teacherId: 20, classroomId: 32, slotId: 2, isLocked: false, consecutiveGroup: null },
  { id: 4, classId: 13, teacherId: 22, classroomId: 33, slotId: 4, isLocked: true, consecutiveGroup: null }
]

describe('M6 local adjustments', () => {
  it('detects class, teacher and locked conflicts locally', () => {
    expect(detectAdjustmentConflicts(lessons, { lessonId: 1, fromSlotId: 1, toSlotId: 2 }).map((x) => x.code)).toEqual(['TEACHER'])
    expect(detectAdjustmentConflicts(lessons, { lessonId: 4, fromSlotId: 4, toSlotId: 1 })[0].code).toBe('LOCKED')
  })
  it('supports 50-step undo and redo semantics', () => {
    const current = lessons.map((lesson) => ({ ...lesson }))
    const history = new AdjustmentHistory(50)
    const command = createAdjustmentCommand({ lessonId: 1, fromSlotId: 1, toSlotId: 5 })
    history.execute(command, current)
    expect(current[0].slotId).toBe(5)
    expect(history.undo(current)).toBe(true)
    expect(current[0].slotId).toBe(1)
    expect(history.redo(current)).toBe(true)
    expect(current[0].slotId).toBe(5)
  })
})
