import type { AdjustmentLesson } from '@shared/adjustments'
import type { FixedLesson, Klass, Lesson } from '@shared/types/entities'

/** 把普通课程和未物化的预排占位统一成调课冲突行。 */
export function buildAdjustmentRows(
  lessons: readonly Lesson[],
  fixedLessons: readonly FixedLesson[],
  classes: readonly Klass[]
): AdjustmentLesson[] {
  const rows: AdjustmentLesson[] = lessons.map((lesson) => ({
    id: lesson.id,
    classId: lesson.classId,
    teacherId: lesson.teacherId,
    classroomId: lesson.classroomId,
    slotId: lesson.slotId,
    isLocked: lesson.isLocked,
    consecutiveGroup: lesson.consecutiveGroup
  }))
  let virtualId = -1_000_000_000
  for (const fixedLesson of fixedLessons) {
    const targetClassIds =
      fixedLesson.kind === 'block'
        ? [virtualId--]
        : fixedLesson.classId != null
          ? [fixedLesson.classId]
          : classes.filter((cls) => cls.gradeId === fixedLesson.gradeId).map((cls) => cls.id)
    // block 只占教师/教室，没有班级目标，也需要一条虚拟行参与资源冲突检测。
    const targets = targetClassIds.length > 0 ? targetClassIds : [virtualId--]
    for (const classId of targets) {
      const materialized =
        fixedLesson.kind === 'lesson' &&
        lessons.some(
          (lesson) =>
            lesson.isLocked &&
            lesson.classId === classId &&
            lesson.slotId === fixedLesson.slotId &&
            lesson.teacherId === fixedLesson.teacherId &&
            lesson.classroomId === fixedLesson.classroomId
        )
      if (materialized) continue
      rows.push({
        id: virtualId--,
        classId,
        teacherId: fixedLesson.teacherId,
        classroomId: fixedLesson.classroomId,
        slotId: fixedLesson.slotId,
        isLocked: true,
        consecutiveGroup: null
      })
    }
  }
  return rows
}
