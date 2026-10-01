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
  actionType?: 'move' | 'swap'
  lessonId: number
  fromSlotId: number
  toSlotId: number
  swapWithLessonId?: number
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

  if (proposal.swapWithLessonId != null) {
    return detectSwapConflicts(lessons, proposal.lessonId, proposal.swapWithLessonId)
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

/** 检测两节课程互相对调时段的硬冲突；两课均不能为锁定课，且在互换时段不得撞其他课。 */
export function detectSwapConflicts(
  lessons: readonly AdjustmentLesson[],
  lessonAId: number,
  lessonBId: number
): AdjustmentConflict[] {
  const lessonA = lessons.find((l) => l.id === lessonAId)
  const lessonB = lessons.find((l) => l.id === lessonBId)
  if (!lessonA || !lessonB) {
    return [{ code: 'CLASS', lessonIds: [], message: '找不到要对调的课程' }]
  }
  if (lessonA.isLocked) {
    return [{ code: 'LOCKED', lessonIds: [lessonA.id], message: '源课程为预排锁定，不可移动' }]
  }
  if (lessonB.isLocked) {
    return [{ code: 'LOCKED', lessonIds: [lessonB.id], message: '目标课程为预排锁定，不可对调' }]
  }
  if (lessonA.slotId === lessonB.slotId) {
    return [
      {
        code: 'CLASS',
        lessonIds: [lessonA.id, lessonB.id],
        message: '两节课程处于同一时段，无需对调'
      }
    ]
  }

  const conflicts: AdjustmentConflict[] = []
  const slotA = lessonA.slotId
  const slotB = lessonB.slotId

  for (const other of lessons) {
    if (other.id === lessonA.id || other.id === lessonB.id) continue

    // 检查在 slotB（lessonA 新落点）：是否存在除 lessonB 外的其他课程与 lessonA 冲突
    if (other.slotId === slotB) {
      if (other.classId === lessonA.classId) {
        conflicts.push({
          code: 'CLASS',
          lessonIds: [lessonA.id, other.id],
          message: '班级在目标时段已有其他课程'
        })
      }
      if (lessonA.teacherId != null && other.teacherId === lessonA.teacherId) {
        conflicts.push({
          code: 'TEACHER',
          lessonIds: [lessonA.id, other.id],
          message: '源课教师在目标时段已有其他课程'
        })
      }
      if (lessonA.classroomId != null && other.classroomId === lessonA.classroomId) {
        conflicts.push({
          code: 'ROOM',
          lessonIds: [lessonA.id, other.id],
          message: '源课教室在目标时段已被其他课程占用'
        })
      }
    }

    // 检查在 slotA（lessonB 新落点）：是否存在除 lessonA 外的其他课程与 lessonB 冲突
    if (other.slotId === slotA) {
      if (other.classId === lessonB.classId) {
        conflicts.push({
          code: 'CLASS',
          lessonIds: [lessonB.id, other.id],
          message: '班级在原时段已有其他课程'
        })
      }
      if (lessonB.teacherId != null && other.teacherId === lessonB.teacherId) {
        conflicts.push({
          code: 'TEACHER',
          lessonIds: [lessonB.id, other.id],
          message: '目标课教师在原时段已有其他课程'
        })
      }
      if (lessonB.classroomId != null && other.classroomId === lessonB.classroomId) {
        conflicts.push({
          code: 'ROOM',
          lessonIds: [lessonB.id, other.id],
          message: '目标课教室在原时段已被其他课程占用'
        })
      }
    }
  }

  return conflicts
}

export interface AdjustmentViewContext {
  view: 'class' | 'teacher' | 'room' | 'overview'
  targetId: number | null
}

/**
 * 用和实际落点完全相同的冲突检测批量计算可调目标（含空白移入与合法对调），供拖拽与单击高亮共用。
 * 原位置不是“移动目标”；单击源课程由交互层解释为取消调课。
 */
export function validAdjustmentTargets(
  lessons: readonly AdjustmentLesson[],
  lessonId: number,
  slotIds: readonly number[],
  viewContext?: AdjustmentViewContext
): Set<number> {
  const moving = lessons.find((lesson) => lesson.id === lessonId)
  if (!moving || moving.isLocked) return new Set()

  const validSlots = new Set<number>()

  for (const slotId of slotIds) {
    if (slotId === moving.slotId) continue

    // 查找在当前视图上下文下占用该 slotId 的课程
    let occupants: AdjustmentLesson[] = []
    if (viewContext && viewContext.targetId != null) {
      if (viewContext.view === 'class') {
        occupants = lessons.filter((l) => l.classId === viewContext.targetId && l.slotId === slotId)
      } else if (viewContext.view === 'teacher') {
        occupants = lessons.filter(
          (l) => l.teacherId === viewContext.targetId && l.slotId === slotId
        )
      } else if (viewContext.view === 'room') {
        occupants = lessons.filter(
          (l) => l.classroomId === viewContext.targetId && l.slotId === slotId
        )
      }
    } else {
      occupants = lessons.filter(
        (l) =>
          l.slotId === slotId &&
          (l.classId === moving.classId ||
            (moving.teacherId != null && l.teacherId === moving.teacherId) ||
            (moving.classroomId != null && l.classroomId === moving.classroomId))
      )
    }

    if (occupants.length === 0) {
      // 空白槽位：单课移入
      if (
        detectAdjustmentConflicts(lessons, {
          lessonId,
          fromSlotId: moving.slotId,
          toSlotId: slotId
        }).length === 0
      ) {
        validSlots.add(slotId)
      }
    } else {
      // 占用槽位：检测是否能与该槽位上的课程对调
      const canSwap = occupants.some(
        (occ) => !occ.isLocked && detectSwapConflicts(lessons, moving.id, occ.id).length === 0
      )
      if (canSwap) {
        validSlots.add(slotId)
      }
    }
  }

  return validSlots
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
      if (proposal.swapWithLessonId != null) {
        const swapLesson = lessons.find((item) => item.id === proposal.swapWithLessonId)
        if (swapLesson) swapLesson.slotId = proposal.fromSlotId
      }
    },
    undo(lessons) {
      const lesson = lessons.find((item) => item.id === proposal.lessonId)
      if (lesson) lesson.slotId = proposal.fromSlotId
      if (proposal.swapWithLessonId != null) {
        const swapLesson = lessons.find((item) => item.id === proposal.swapWithLessonId)
        if (swapLesson) swapLesson.slotId = proposal.toSlotId
      }
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
