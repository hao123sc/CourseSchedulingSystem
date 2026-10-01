import { describe, expect, it } from 'vitest'
import { findTopSwapSuggestions, type SwapSuggestContext } from './swapSuggest'
import type { TimeSlot } from './types/entities'

describe('M9 · 智能换课建议算法 (SwapSuggest)', () => {
  const sampleSlots: TimeSlot[] = [
    { id: 101, stageId: 1, dayOfWeek: 1, periodIndex: 1, periodName: '第1节', segment: 'morning', isTeaching: true, sortOrder: 1, startTime: '08:00', endTime: '08:40' },
    { id: 102, stageId: 1, dayOfWeek: 1, periodIndex: 2, periodName: '第2节', segment: 'morning', isTeaching: true, sortOrder: 2, startTime: '08:50', endTime: '09:30' },
    { id: 103, stageId: 1, dayOfWeek: 1, periodIndex: 3, periodName: '第3节', segment: 'morning', isTeaching: true, sortOrder: 3, startTime: '09:50', endTime: '10:30' },
    { id: 104, stageId: 1, dayOfWeek: 1, periodIndex: 4, periodName: '第4节', segment: 'morning', isTeaching: true, sortOrder: 4, startTime: '10:40', endTime: '11:20' },
    { id: 105, stageId: 1, dayOfWeek: 1, periodIndex: 5, periodName: '第5节', segment: 'afternoon', isTeaching: true, sortOrder: 5, startTime: '14:00', endTime: '14:40' },
    { id: 106, stageId: 1, dayOfWeek: 1, periodIndex: 6, periodName: '第6节', segment: 'afternoon', isTeaching: true, sortOrder: 6, startTime: '14:50', endTime: '15:30' },
    { id: 201, stageId: 1, dayOfWeek: 2, periodIndex: 1, periodName: '第1节', segment: 'morning', isTeaching: true, sortOrder: 7, startTime: '08:00', endTime: '08:40' },
    { id: 202, stageId: 1, dayOfWeek: 2, periodIndex: 2, periodName: '第2节', segment: 'morning', isTeaching: true, sortOrder: 8, startTime: '08:50', endTime: '09:30' },
    { id: 205, stageId: 1, dayOfWeek: 2, periodIndex: 5, periodName: '第5节', segment: 'afternoon', isTeaching: true, sortOrder: 9, startTime: '14:00', endTime: '14:40' }
  ]

  const sampleSubjects = [
    { id: 1, name: '语文', category: 'main', importance: 5 },
    { id: 2, name: '数学', category: 'main', importance: 5 },
    { id: 3, name: '美术', category: 'activity', importance: 1 }
  ]

  const sampleTeachers = [
    { id: 10, name: '张老师' },
    { id: 20, name: '李老师' },
    { id: 30, name: '王老师' }
  ]

  it('suggests moving afternoon main subject to morning slots', () => {
    const ctx: SwapSuggestContext = {
      slots: sampleSlots,
      subjects: sampleSubjects,
      teachers: sampleTeachers,
      lessons: [
        // Class 1, Lesson 1: Chinese (Main) at Afternoon Monday P5
        { id: 1, classId: 1, subjectId: 1, teacherId: 10, classroomId: null, slotId: 105, isLocked: false },
        // Class 1, Lesson 2: Art at Morning Monday P1
        { id: 2, classId: 1, subjectId: 3, teacherId: 30, classroomId: null, slotId: 101, isLocked: false }
      ]
    }

    const suggestions = findTopSwapSuggestions(1, ctx, 5)
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.length).toBeLessThanOrEqual(5)

    const morningMoves = suggestions.filter((s) => s.targetSegment === 'morning')
    expect(morningMoves.length).toBeGreaterThan(0)
    expect(morningMoves[0].score).toBeGreaterThan(50)
  })

  it('rejects locked lessons from swap recommendations', () => {
    const ctx: SwapSuggestContext = {
      slots: sampleSlots,
      subjects: sampleSubjects,
      teachers: sampleTeachers,
      lessons: [
        { id: 1, classId: 1, subjectId: 1, teacherId: 10, classroomId: null, slotId: 105, isLocked: true },
        { id: 2, classId: 1, subjectId: 3, teacherId: 30, classroomId: null, slotId: 101, isLocked: false }
      ]
    }

    const suggestions = findTopSwapSuggestions(1, ctx, 5)
    expect(suggestions).toEqual([])
  })
})
