import type { SolverContext } from './context'
import type { Solution } from '../model/solution'

export interface QualityMetrics {
  maxTeacherDayPeriods: number
  teacherGapCount: number
  sameSubjectDayRepeatRate: number
  importantMorningRate: number
  consecutiveCompleteness: number
}

function points(ctx: SolverContext, solution: Solution) {
  const result: {
    classId: number
    subjectId: number
    teacherId: number | null
    day: number
    period: number
    importance: number
    unitId: number
  }[] = []
  for (const [unitId, assignment] of solution.assignments) {
    const unit = ctx.units[unitId]
    if (!unit) continue
    for (const slotId of assignment.slotIds) {
      const si = ctx.slotIdx.get(slotId)
      if (si == null) continue
      const slot = ctx.slots[si]
      for (const classId of unit.classIds) {
        result.push({
          classId,
          subjectId: unit.subjectId,
          teacherId: unit.teacherIds[0] ?? null,
          day: slot.dayOfWeek,
          period: slot.periodIndex,
          importance: unit.importance,
          unitId
        })
      }
    }
  }
  return result
}

export function measureQuality(ctx: SolverContext, solution: Solution): QualityMetrics {
  const lessons = points(ctx, solution)
  const byTeacherDay = new Map<string, number[]>()
  const byClassSubjectDay = new Map<string, number>()
  for (const lesson of lessons) {
    const teacherKey = `${lesson.teacherId ?? 'none'}:${lesson.day}`
    const slots = byTeacherDay.get(teacherKey) ?? []
    slots.push(lesson.period)
    byTeacherDay.set(teacherKey, slots)
    const key = `${lesson.classId}:${lesson.subjectId}:${lesson.day}`
    byClassSubjectDay.set(key, (byClassSubjectDay.get(key) ?? 0) + 1)
  }
  let teacherGapCount = 0
  let maxTeacherDayPeriods = 0
  for (const slots of byTeacherDay.values()) {
    maxTeacherDayPeriods = Math.max(maxTeacherDayPeriods, slots.length)
    const ordered = [...slots].sort((a, b) => a - b)
    if (ordered.length > 1)
      teacherGapCount += ordered[ordered.length - 1] - ordered[0] + 1 - ordered.length
  }
  const repeated = [...byClassSubjectDay.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0
  )
  const total = lessons.length
  const important = lessons.filter((lesson) => lesson.importance >= 4)
  const importantMorning = important.filter((lesson) => {
    const slot = ctx.slots.find(
      (candidate) => candidate.dayOfWeek === lesson.day && candidate.periodIndex === lesson.period
    )
    return slot?.segment === 'morning'
  }).length
  const explicitBlockUnits = ctx.units.filter((unit) => unit.size > 1)
  const completeBlocks = explicitBlockUnits.filter(
    (unit) => solution.assignments.get(unit.id)?.slotIds.length === unit.size
  ).length
  return {
    maxTeacherDayPeriods,
    teacherGapCount,
    sameSubjectDayRepeatRate: total ? repeated / total : 0,
    importantMorningRate: important.length ? importantMorning / important.length : 1,
    consecutiveCompleteness: explicitBlockUnits.length
      ? completeBlocks / explicitBlockUnits.length
      : 1
  }
}

export function assertQualityMetrics(metrics: QualityMetrics, teacherCount: number): void {
  const failures: string[] = []
  if (metrics.maxTeacherDayPeriods > 6)
    failures.push(`教师日课时 ${metrics.maxTeacherDayPeriods} > 6`)
  if (metrics.teacherGapCount > teacherCount * 0.3)
    failures.push(`空隙课 ${metrics.teacherGapCount} > ${teacherCount * 0.3}`)
  if (metrics.sameSubjectDayRepeatRate > 0.05)
    failures.push(`同科同日重复率 ${metrics.sameSubjectDayRepeatRate} > 5%`)
  if (metrics.importantMorningRate < 0.7)
    failures.push(`主课上午率 ${metrics.importantMorningRate} < 70%`)
  if (metrics.consecutiveCompleteness < 1)
    failures.push(`连堂完整率 ${metrics.consecutiveCompleteness} < 100%`)
  if (failures.length) throw new Error(`质量指标未达标：${failures.join('；')}`)
}
