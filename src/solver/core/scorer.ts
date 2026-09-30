/**
 * M5 软约束评分器。
 *
 * 评分器只依赖 SolverContext/Solution，不做 IO；硬约束仍由 verifyHardConstraints
 * 独立校验。缓存按 classDay / teacherDay / subjectDay 建索引，供 Move 的增量评分复用。
 */
import type { SolverContext } from './context'
import { countAccidentalBlocks } from './adjacency'
import type { Assignment, Solution } from '../model/solution'

export const SOFT_CODES = [
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
  'S9',
  'S10',
  'S11',
  'S12',
  'S13',
  'S14',
  'S15'
] as const
export type SoftCode = (typeof SOFT_CODES)[number]
export type ScoreBreakdown = Record<SoftCode, number>

export interface ScoreResult {
  total: number
  breakdown: ScoreBreakdown
  /** 每个指标的未加权原始值，便于 UI 展示与回归断言。 */
  metrics: ScoreBreakdown
}

export interface ScoreCache {
  /** 每个单元的明细点，增量更新时只移除/重建受影响单元。 */
  unitPoints: Map<number, LessonPoint[]>
  classDay: Map<string, number>
  teacherDay: Map<string, number>
  subjectDay: Map<string, number>
  classSubjectDay: Map<string, number>
  roomSlot: Map<string, number>
  teacherDaySlots: Map<string, number[]>
  roomUse: Map<number, number>
}

interface LessonPoint {
  unitId: number
  classId: number
  subjectId: number
  teacherId: number | null
  roomId: number | null
  slotIdx: number
  day: number
  period: number
  segment: string
  importance: number
  building: string | null
}

function key(...parts: (number | string)[]): string {
  return parts.join(':')
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

function variance(values: number[]): number {
  if (values.length === 0) return 0
  const m = mean(values)
  return mean(values.map((v) => (v - m) ** 2))
}

function stddev(values: number[]): number {
  return Math.sqrt(variance(values))
}

function assignmentPoints(
  ctx: SolverContext,
  unitId: number,
  assignment: Assignment
): LessonPoint[] {
  const u = ctx.units[unitId]
  if (!u) return []
  const points: LessonPoint[] = []
  assignment.slotIds.forEach((slotId, blockIndex) => {
    const si = ctx.slotIdx.get(slotId)
    if (si == null) return
    const slot = ctx.slots[si]
    u.classIds.forEach((classId, classIndex) => {
      const roomId = assignment.roomIds[classIndex] ?? null
      const room = roomId == null ? undefined : ctx.input.rooms.find((r) => r.id === roomId)
      points.push({
        unitId,
        classId,
        subjectId: u.subjectId,
        teacherId: u.teacherIds[classIndex] ?? u.teacherIds[0] ?? null,
        roomId,
        slotIdx: si,
        day: slot.dayOfWeek,
        period: slot.periodIndex + blockIndex * 0,
        segment: slot.segment,
        importance: u.importance,
        building: room?.building ?? null
      })
    })
  })
  return points
}

function collect(
  ctx: SolverContext,
  solution: Solution
): { points: LessonPoint[]; cache: ScoreCache } {
  const unitPoints = new Map<number, LessonPoint[]>()
  for (const [id, assignment] of solution.assignments)
    unitPoints.set(id, assignmentPoints(ctx, id, assignment))
  const points = [...unitPoints.values()].flat()
  const cache: ScoreCache = {
    unitPoints,
    classDay: new Map(),
    teacherDay: new Map(),
    subjectDay: new Map(),
    classSubjectDay: new Map(),
    roomSlot: new Map(),
    teacherDaySlots: new Map(),
    roomUse: new Map()
  }
  for (const p of points) {
    cache.classDay.set(key(p.classId, p.day), (cache.classDay.get(key(p.classId, p.day)) ?? 0) + 1)
    if (p.teacherId != null) {
      cache.teacherDay.set(
        key(p.teacherId, p.day),
        (cache.teacherDay.get(key(p.teacherId, p.day)) ?? 0) + 1
      )
      const slots = cache.teacherDaySlots.get(key(p.teacherId, p.day)) ?? []
      slots.push(p.period)
      cache.teacherDaySlots.set(key(p.teacherId, p.day), slots)
    }
    cache.subjectDay.set(
      key(p.classId, p.subjectId, p.day),
      (cache.subjectDay.get(key(p.classId, p.subjectId, p.day)) ?? 0) + 1
    )
    cache.classSubjectDay.set(
      key(p.classId, p.subjectId, p.day),
      (cache.classSubjectDay.get(key(p.classId, p.subjectId, p.day)) ?? 0) + 1
    )
    if (p.roomId != null) {
      cache.roomSlot.set(
        key(p.roomId, p.slotIdx),
        (cache.roomSlot.get(key(p.roomId, p.slotIdx)) ?? 0) + 1
      )
      cache.roomUse.set(p.roomId, (cache.roomUse.get(p.roomId) ?? 0) + 1)
    }
  }
  return { points, cache }
}

function ruleAt(ctx: SolverContext, unitId: number, slotIdx: number): string {
  return ctx.ruleValueOf(unitId, slotIdx)
}

function emptyBreakdown(): ScoreBreakdown {
  return Object.fromEntries(SOFT_CODES.map((code) => [code, 0])) as ScoreBreakdown
}

/** 计算完整评分；默认使用 SolverInput 中已加载的三档权重。 */
export function scoreSolution(
  ctx: SolverContext,
  solution: Solution,
  weights = ctx.input.weights
): ScoreResult {
  const { points, cache } = collect(ctx, solution)
  const metrics = emptyBreakdown()
  const days = Math.max(1, ...ctx.slots.map((s) => s.dayOfWeek))

  // S1：同班同科同日超过学科 dailyMax 的平方惩罚。
  for (const subject of ctx.input.subjects) {
    for (const cls of ctx.input.classes) {
      for (let day = 1; day <= days; day++) {
        const count = cache.classSubjectDay.get(key(cls.id, subject.id, day)) ?? 0
        metrics.S1 += Math.max(0, count - subject.dailyMax) ** 2
      }
    }
  }

  // S2：同班同科上课日之间隔距的标准差；一天一节不惩罚。
  for (const cls of ctx.input.classes) {
    for (const subject of ctx.input.subjects) {
      const used = Array.from({ length: days }, (_, i) => i + 1).filter(
        (day) => (cache.subjectDay.get(key(cls.id, subject.id, day)) ?? 0) > 0
      )
      const gaps = used.slice(1).map((day, i) => day - used[i])
      metrics.S2 += stddev(gaps)
    }
  }

  metrics.S3 = points.filter((p) => p.importance >= 4 && p.segment !== 'morning').length
  for (const p of points) {
    const si = ctx.slotIdx.get(ctx.slots[p.slotIdx]?.id)
    if (si == null) continue
    const rule = ruleAt(ctx, p.unitId, si)
    if (rule === 'AVOID') metrics.S4 += 1
    if (rule === 'PREFERRED') metrics.S5 += 1
  }

  // S6/S7/S8/S12：教师日负载、空隙、跨楼栋和完整空闲日。
  for (const teacher of ctx.input.teachers) {
    const daily = Array.from(
      { length: days },
      (_, i) => cache.teacherDay.get(key(teacher.id, i + 1)) ?? 0
    )
    metrics.S6 += variance(daily)
    metrics.S12 -= daily.filter((n) => n === 0).length
    for (let day = 1; day <= days; day++) {
      const slots = [...(cache.teacherDaySlots.get(key(teacher.id, day)) ?? [])].sort(
        (a, b) => a - b
      )
      if (slots.length > 1) metrics.S7 += slots[slots.length - 1] - slots[0] + 1 - slots.length
      const dayPoints = points
        .filter((p) => p.teacherId === teacher.id && p.day === day)
        .sort((a, b) => a.period - b.period)
      for (let i = 1; i < dayPoints.length; i++) {
        if (
          dayPoints[i - 1].building &&
          dayPoints[i].building &&
          dayPoints[i - 1].building !== dayPoints[i].building
        )
          metrics.S8++
      }
    }
  }

  metrics.S9 = countAccidentalBlocks(ctx, solution)
  // S10：班级每日重要性总量超过 2 × 每日课程数的部分。
  for (const cls of ctx.input.classes) {
    for (let day = 1; day <= days; day++) {
      const total = points
        .filter((p) => p.classId === cls.id && p.day === day)
        .reduce((sum, p) => sum + p.importance, 0)
      metrics.S10 += Math.max(0, total - 10)
    }
  }
  // S11：无基线课表时为 0；增量重排由 scorer 的 baseline 扩展提供。
  metrics.S11 = 0
  // S13：每个实际使用的班科组合的空白日数量。
  for (const cls of ctx.input.classes) {
    for (const subject of ctx.input.subjects) {
      const total = points.filter((p) => p.classId === cls.id && p.subjectId === subject.id).length
      if (total > 0)
        metrics.S13 +=
          days -
          new Set(
            points
              .filter((p) => p.classId === cls.id && p.subjectId === subject.id)
              .map((p) => p.day)
          ).size
    }
  }
  // S14：场地单时段使用量超过并发容量 80% 的次数。
  for (const [roomSlot, count] of cache.roomSlot) {
    const [roomId] = roomSlot.split(':').map(Number)
    const room = ctx.input.rooms.find((r) => r.id === roomId)
    if (room && count > room.concurrentCapacity * 0.8) metrics.S14++
  }
  // S15：不同场地的使用率标准差。
  const rates = ctx.input.rooms.map((room) => {
    const totalSlots = Math.max(
      1,
      ctx.slots.filter((s) => s.isTeaching).length * room.concurrentCapacity
    )
    return (cache.roomUse.get(room.id) ?? 0) / totalSlots
  })
  metrics.S15 = stddev(rates)

  const breakdown = { ...metrics }
  const total = SOFT_CODES.reduce((sum, code) => sum + (weights[code] ?? 0) * breakdown[code], 0)
  return { total, breakdown, metrics }
}

function adjust(map: Map<string, number>, item: string, delta: number): void {
  const next = (map.get(item) ?? 0) + delta
  if (next === 0) map.delete(item)
  else map.set(item, next)
}

function applyPoint(cache: ScoreCache, point: LessonPoint, delta: number): void {
  adjust(cache.classDay, key(point.classId, point.day), delta)
  if (point.teacherId != null) {
    adjust(cache.teacherDay, key(point.teacherId, point.day), delta)
    const slotKey = key(point.teacherId, point.day)
    const slots = cache.teacherDaySlots.get(slotKey) ?? []
    if (delta > 0) slots.push(point.period)
    else {
      const index = slots.indexOf(point.period)
      if (index >= 0) slots.splice(index, 1)
    }
    if (slots.length) cache.teacherDaySlots.set(slotKey, slots)
    else cache.teacherDaySlots.delete(slotKey)
  }
  adjust(cache.subjectDay, key(point.classId, point.subjectId, point.day), delta)
  adjust(cache.classSubjectDay, key(point.classId, point.subjectId, point.day), delta)
  if (point.roomId != null) {
    adjust(cache.roomSlot, key(point.roomId, point.slotIdx), delta)
    const next = (cache.roomUse.get(point.roomId) ?? 0) + delta
    if (next === 0) cache.roomUse.delete(point.roomId)
    else cache.roomUse.set(point.roomId, next)
  }
}

/** 构建可供 Move 复用的增量缓存。 */
export function buildScoreCache(ctx: SolverContext, solution: Solution): ScoreCache {
  return collect(ctx, solution).cache
}

/** 只刷新发生变化的单元，不扫描其余 assignments。 */
export function updateScoreCache(
  ctx: SolverContext,
  solution: Solution,
  cache: ScoreCache,
  changedUnitIds: readonly number[]
): ScoreCache {
  for (const unitId of new Set(changedUnitIds)) {
    for (const point of cache.unitPoints.get(unitId) ?? []) applyPoint(cache, point, -1)
    const assignment = solution.assignments.get(unitId)
    const next = assignment ? assignmentPoints(ctx, unitId, assignment) : []
    for (const point of next) applyPoint(cache, point, 1)
    if (next.length) cache.unitPoints.set(unitId, next)
    else cache.unitPoints.delete(unitId)
  }
  return cache
}

/** 仅为增量接口保留的统一入口，保证后续算子无需知道缓存实现细节。 */
export function deltaScore(
  ctx: SolverContext,
  solution: Solution,
  _changedUnitIds: readonly number[],
  weights = ctx.input.weights
): ScoreResult {
  return scoreSolution(ctx, solution, weights)
}
