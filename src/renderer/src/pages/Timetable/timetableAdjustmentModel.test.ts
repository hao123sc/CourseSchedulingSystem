import { describe, expect, it } from 'vitest'
import { detectAdjustmentConflicts } from '@shared/adjustments'
import type { FixedLesson, Klass, Lesson } from '@shared/types/entities'
import { buildAdjustmentRows } from './timetableAdjustmentModel'

const classes: Klass[] = [
  {
    id: 1,
    gradeId: 10,
    name: '一班',
    shortName: null,
    studentCount: 54,
    headTeacherId: null,
    homeRoomId: 30,
    isVirtual: false,
    sortOrder: 1
  },
  {
    id: 2,
    gradeId: 10,
    name: '二班',
    shortName: null,
    studentCount: 54,
    headTeacherId: null,
    homeRoomId: 31,
    isVirtual: false,
    sortOrder: 2
  }
]

const moving: Lesson = {
  id: 1,
  versionId: 1,
  taskId: 1,
  classId: 1,
  subjectId: 1,
  teacherId: 20,
  classroomId: 30,
  slotId: 1,
  weekMode: 'all',
  isLocked: false,
  consecutiveGroup: null,
  remark: null
}

const fixed = (id: number, values: Partial<FixedLesson>): FixedLesson => ({
  id,
  semesterId: 1,
  kind: 'lesson',
  classId: null,
  gradeId: null,
  subjectId: null,
  teacherId: null,
  classroomId: null,
  slotId: 2,
  label: null,
  ...values
})

describe('timetable adjustment rows', () => {
  it('turns grade fixed lessons and resource blocks into target conflicts', () => {
    const rows = buildAdjustmentRows(
      [moving],
      [fixed(1, { gradeId: 10, slotId: 2 }), fixed(2, { kind: 'block', teacherId: 20, slotId: 3 })],
      classes
    )

    expect(
      detectAdjustmentConflicts(rows, { lessonId: 1, fromSlotId: 1, toSlotId: 2 }).map(
        (conflict) => conflict.code
      )
    ).toContain('CLASS')
    expect(
      detectAdjustmentConflicts(rows, { lessonId: 1, fromSlotId: 1, toSlotId: 3 }).map(
        (conflict) => conflict.code
      )
    ).toContain('TEACHER')
  })

  it('does not add a duplicate virtual row for a materialized locked lesson', () => {
    const locked: Lesson = {
      ...moving,
      id: 2,
      slotId: 2,
      isLocked: true
    }
    const rows = buildAdjustmentRows(
      [moving, locked],
      [fixed(1, { classId: 1, teacherId: 20, classroomId: 30, slotId: 2 })],
      classes
    )
    expect(rows).toHaveLength(2)
  })
})
