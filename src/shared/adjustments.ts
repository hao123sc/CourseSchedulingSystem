/** M6 本地换课模型：纯 TS、无 IPC/数据库依赖，供拖拽落点与撤销栈复用。 */
export interface AdjustmentLesson {
  id: number
  classId: number
  teacherId: number | null
  classroomId: number | null
  slotId: number
  isLocked: boolean
  consecutiveGroup: string | null
}

export type AdjustmentConflictCode = 'LOCKED' | 'CLASS' | 'TEACHER' | 'ROOM'

export interface AdjustmentConflict {
  code: AdjustmentConflictCode
  lessonIds: number[]
  message: string
}

export interface AdjustmentProposal {
  lessonId: number
  fromSlotId: number
  toSlotId: number
}

/** 只检测换课落点，不改动传入数组；响应路径可直接在渲染端调用。 */
export function detectAdjustmentConflicts(
  lessons: readonly AdjustmentLesson[],
  proposal: AdjustmentProposal
): AdjustmentConflict[] {
  const moving = lessons.find((lesson) => lesson.id === proposal.lessonId)
  if (!moving)
    return [{ code: 'CLASS', lessonIds: [proposal.lessonId], message: '找不到要调整的课程' }]
  if (moving.isLocked) {
    return [{ code: 'LOCKED', lessonIds: [moving.id], message: '预排锁定课程不可移动' }]
  }
  const conflicts: AdjustmentConflict[] = []
  for (const lesson of lessons) {
    if (lesson.id === moving.id || lesson.slotId !== proposal.toSlotId) continue
    if (lesson.classId === moving.classId) {
      conflicts.push({
        code: 'CLASS',
        lessonIds: [moving.id, lesson.id],
        message: '同一班级在该时段已有课程'
      })
    }
    if (moving.teacherId != null && lesson.teacherId === moving.teacherId) {
      conflicts.push({
        code: 'TEACHER',
        lessonIds: [moving.id, lesson.id],
        message: '该教师在该时段已有课程'
      })
    }
    if (moving.classroomId != null && lesson.classroomId === moving.classroomId) {
      conflicts.push({
        code: 'ROOM',
        lessonIds: [moving.id, lesson.id],
        message: '该教室在该时段已有课程'
      })
    }
  }
  return conflicts
}

/**
 * 用和实际落点完全相同的冲突检测批量计算可调目标，供拖拽与单击高亮共用。
 * 原位置不是“移动目标”；单击源课程由交互层解释为取消调课。
 */
export function validAdjustmentTargets(
  lessons: readonly AdjustmentLesson[],
  lessonId: number,
  slotIds: readonly number[]
): Set<number> {
  const moving = lessons.find((lesson) => lesson.id === lessonId)
  if (!moving || moving.isLocked) return new Set()
  return new Set(
    slotIds.filter(
      (slotId) =>
        slotId !== moving.slotId &&
        detectAdjustmentConflicts(lessons, {
          lessonId,
          fromSlotId: moving.slotId,
          toSlotId: slotId
        }).length === 0
    )
  )
}

export interface AdjustmentCommand {
  readonly proposal: AdjustmentProposal
  apply(lessons: AdjustmentLesson[]): void
  undo(lessons: AdjustmentLesson[]): void
}

export function createAdjustmentCommand(proposal: AdjustmentProposal): AdjustmentCommand {
  return {
    proposal,
    apply(lessons) {
      const lesson = lessons.find((item) => item.id === proposal.lessonId)
      if (lesson) lesson.slotId = proposal.toSlotId
    },
    undo(lessons) {
      const lesson = lessons.find((item) => item.id === proposal.lessonId)
      if (lesson) lesson.slotId = proposal.fromSlotId
    }
  }
}

/** 最多保留 limit 步；新操作会清空 redo 栈。 */
export class AdjustmentHistory {
  private readonly undoStack: AdjustmentCommand[] = []
  private readonly redoStack: AdjustmentCommand[] = []
  constructor(private readonly limit = 50) {}

  execute(command: AdjustmentCommand, lessons: AdjustmentLesson[]): void {
    command.apply(lessons)
    this.undoStack.push(command)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack.length = 0
  }
  undo(lessons: AdjustmentLesson[]): boolean {
    const command = this.undoStack.pop()
    if (!command) return false
    command.undo(lessons)
    this.redoStack.push(command)
    return true
  }
  redo(lessons: AdjustmentLesson[]): boolean {
    const command = this.redoStack.pop()
    if (!command) return false
    command.apply(lessons)
    this.undoStack.push(command)
    return true
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }
  get nextUndo(): AdjustmentCommand | null {
    return this.undoStack[this.undoStack.length - 1] ?? null
  }
  get nextRedo(): AdjustmentCommand | null {
    return this.redoStack[this.redoStack.length - 1] ?? null
  }
}
