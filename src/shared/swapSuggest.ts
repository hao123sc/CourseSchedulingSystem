import type { TimeSlot } from './types/entities'
import { detectAdjustmentConflicts, type AdjustmentLesson } from './adjustments'

export interface SwapSuggestion {
  targetSlotId: number
  targetDay: number
  targetPeriod: number
  targetPeriodName: string
  targetSegment: string
  actionType: 'move' | 'swap'
  swappedLesson?: {
    id: number
    subjectName: string
    teacherName?: string
  }
  score: number // Higher is better
  reasons: string[]
}

export interface SwapSuggestContext {
  lessons: {
    id: number
    classId: number
    subjectId: number
    teacherId: number | null
    classroomId: number | null
    slotId: number
    isLocked: boolean
    weekMode?: string
    consecutiveGroup?: string | null
  }[]
  slots: TimeSlot[]
  subjects: {
    id: number
    name: string
    category?: string
    importance?: number
  }[]
  teachers: {
    id: number
    name: string
  }[]
}

/**
 * 智能换课推荐算法（Top 5 最小代价/最高质量推荐）
 */
export function findTopSwapSuggestions(
  selectedLessonId: number,
  ctx: SwapSuggestContext,
  maxCount = 5
): SwapSuggestion[] {
  const source = ctx.lessons.find((l) => l.id === selectedLessonId)
  if (!source || source.isLocked) return []

  const sourceSlot = ctx.slots.find((s) => s.id === source.slotId)
  if (!sourceSlot) return []

  const slotMap = new Map<number, TimeSlot>(ctx.slots.map((s) => [s.id, s]))
  const subjMap = new Map(ctx.subjects.map((s) => [s.id, s]))
  const teacherMap = new Map(ctx.teachers.map((t) => [t.id, t]))

  const sourceSubj = subjMap.get(source.subjectId)
  const isMainSubject = sourceSubj?.category === 'main' || (sourceSubj?.importance ?? 0) >= 4

  const adjLessons: AdjustmentLesson[] = ctx.lessons.map((l) => ({
    id: l.id,
    classId: l.classId,
    teacherId: l.teacherId,
    classroomId: l.classroomId,
    slotId: l.slotId,
    isLocked: l.isLocked,
    consecutiveGroup: l.consecutiveGroup ?? null
  }))

  const suggestions: SwapSuggestion[] = []

  // 1. 扫描当前班级的所有其他时段（同 stage 下的 slot）
  for (const slot of ctx.slots) {
    if (slot.id === source.slotId) continue

    // 检查此 slot 是否有同一班级的其他课
    const classLessonsAtSlot = ctx.lessons.filter(
      (l) => l.classId === source.classId && l.slotId === slot.id
    )

    if (classLessonsAtSlot.length === 0) {
      // 目标为空位 -> 单向移动 (move)
      const conflicts = detectAdjustmentConflicts(adjLessons, {
        lessonId: source.id,
        fromSlotId: source.slotId,
        toSlotId: slot.id
      })

      if (conflicts.length === 0) {
        // 计算收益评分
        let score = 50
        const reasons: string[] = ['无冲突空位可直接移入']

        // 主课上午偏好
        if (isMainSubject) {
          if (slot.segment === 'morning' && sourceSlot.segment !== 'morning') {
            score += 30
            reasons.push('主课移入上午黄金时段')
          } else if (slot.segment !== 'morning' && sourceSlot.segment === 'morning') {
            score -= 20
          }
        }

        // 避免同天同班同课重复
        const sameSubjSameDay = ctx.lessons.filter(
          (l) =>
            l.classId === source.classId &&
            l.subjectId === source.subjectId &&
            l.id !== source.id &&
            slotMap.get(l.slotId)?.dayOfWeek === slot.dayOfWeek
        ).length

        if (sameSubjSameDay === 0) {
          score += 15
          reasons.push('符合学科周内均衡分散')
        } else {
          score -= 25
        }

        // 教师日程紧凑度优化
        if (source.teacherId != null) {
          const teacherLessonsOnTargetDay = ctx.lessons.filter(
            (l) =>
              l.teacherId === source.teacherId &&
              slotMap.get(l.slotId)?.dayOfWeek === slot.dayOfWeek
          ).length
          if (teacherLessonsOnTargetDay > 0 && teacherLessonsOnTargetDay <= 4) {
            score += 10
            reasons.push('优化教师日工作量分布')
          }
        }

        suggestions.push({
          targetSlotId: slot.id,
          targetDay: slot.dayOfWeek,
          targetPeriod: slot.periodIndex,
          targetPeriodName: slot.periodName,
          targetSegment: slot.segment,
          actionType: 'move',
          score,
          reasons
        })
      }
    } else {
      // 目标有时段课 -> 双向交换 (swap)
      const targetLesson = classLessonsAtSlot[0]
      if (targetLesson.isLocked) continue

      // 模拟两门课交换：
      // 1. source 移到 slot.id（排除 targetLesson 干扰）
      const lessonsWithoutTarget = adjLessons.filter((l) => l.id !== targetLesson.id)
      const sourceConflicts = detectAdjustmentConflicts(lessonsWithoutTarget, {
        lessonId: source.id,
        fromSlotId: source.slotId,
        toSlotId: slot.id
      })

      // 2. target 移到 source.slotId（排除 source 干扰）
      const lessonsWithoutSource = adjLessons.filter((l) => l.id !== source.id)
      const targetConflicts = detectAdjustmentConflicts(lessonsWithoutSource, {
        lessonId: targetLesson.id,
        fromSlotId: targetLesson.slotId,
        toSlotId: source.slotId
      })

      if (sourceConflicts.length === 0 && targetConflicts.length === 0) {
        let score = 40
        const reasons: string[] = ['对调双方无冲突']
        const targetSubj = subjMap.get(targetLesson.subjectId)
        const targetTeacher = targetLesson.teacherId ? teacherMap.get(targetLesson.teacherId) : null

        if (isMainSubject && slot.segment === 'morning' && sourceSlot.segment !== 'morning') {
          score += 25
          reasons.push(`将主课「${sourceSubj?.name}」换入上午`)
        }

        suggestions.push({
          targetSlotId: slot.id,
          targetDay: slot.dayOfWeek,
          targetPeriod: slot.periodIndex,
          targetPeriodName: slot.periodName,
          targetSegment: slot.segment,
          actionType: 'swap',
          swappedLesson: {
            id: targetLesson.id,
            subjectName: targetSubj?.name ?? '课程',
            teacherName: targetTeacher?.name
          },
          score,
          reasons
        })
      }
    }
  }

  // 排序：按 score 从高到低
  suggestions.sort((a, b) => b.score - a.score)
  return suggestions.slice(0, maxCount)
}
