/**
 * 阶段 1.1~1.3：排入顺序 + DSATUR 贪心构造（docs/04 §4.1、§4.2）。
 *
 * 顺序策略（Unit.order 在建模期就算好了）：
 *   预排锁定（已在基线占用里）→ 连堂块 → 拼合/同时上课 → 需专用教室 → 主课 → 其余
 *
 * 选变量：order 分档在前，档内用 MRV（剩余可行窗口最少）+ 度（邻居数）。
 *   剩余可行数会随着放置不断变小，用**惰性堆**维护：堆里存的是上界，
 *   弹出时重算真值，真值更小就压回去再弹，直到弹出的键等于真值为止。
 *   这样避免了每步 O(V·D) 的全量重算，也不需要显式 decrease-key。
 *
 * 选值（LCV）：挑"对别人伤害最小"的窗口 —— 用 slotDemand[slot] =
 *   还没排的单元里有多少个把这个时段算作候选，取和最小者；同分时按种子随机打散，
 *   保证多起点能产生不同解。软约束罚分是 M5 的事，这里只留了加权位置。
 */
import type { SolverContext } from './context'
import { Board } from './board'
import { firstFormalSlotIds, stageDayKey } from './formalPeriods'
import type { Rng } from './random'

export interface ConstructResult {
  board: Board
  unplaced: number[]
}

class LazyHeap {
  private readonly heap: { key: number; unit: number }[] = []
  private cmp(a: { key: number; unit: number }, b: { key: number; unit: number }): number {
    return a.key - b.key
  }
  push(key: number, unit: number): void {
    this.heap.push({ key, unit })
    let i = this.heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.cmp(this.heap[i], this.heap[p]) >= 0) break
      ;[this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]]
      i = p
    }
  }
  pop(): { key: number; unit: number } | undefined {
    if (this.heap.length === 0) return undefined
    const top = this.heap[0]
    const last = this.heap.pop()!
    if (this.heap.length > 0) {
      this.heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < this.heap.length && this.cmp(this.heap[l], this.heap[m]) < 0) m = l
        if (r < this.heap.length && this.cmp(this.heap[r], this.heap[m]) < 0) m = r
        if (m === i) break
        ;[this.heap[i], this.heap[m]] = [this.heap[m], this.heap[i]]
        i = m
      }
    }
    return top
  }
  get size(): number {
    return this.heap.length
  }
}

export function construct(
  ctx: SolverContext,
  domains: number[][],
  rng: Rng,
  opts: { board?: Board; softOptimize?: boolean } = {}
): ConstructResult {
  const board = opts.board ?? new Board(ctx)
  const units = ctx.units
  const softOptimize = opts.softOptimize ?? false

  // 还没排的单元对各时段的需求热度，用于 LCV
  const slotDemand = new Int32Array(ctx.slots.length)
  // 构造期的轻量软约束状态：让初始解已经倾向于均衡教师日负载、
  // 分散同班同科，并把主课推向上午；M5 优化器再做全量精修。
  const teacherDay = new Map<string, number>()
  const teacherDayPeriods = new Map<string, number[]>()
  const classSubjectDay = new Map<string, number>()
  const firstSlots = firstFormalSlotIds(ctx.slots)
  const firstSlotIdSet = new Set(firstSlots.values())
  const classDayFirstFilled = new Set<string>()
  for (const fixedLesson of ctx.fixedPlacements) {
    if (!firstSlotIdSet.has(fixedLesson.slotId)) continue
    const si = ctx.slotIdx.get(fixedLesson.slotId)
    if (si == null) continue
    classDayFirstFilled.add(`${fixedLesson.classId}:${ctx.slots[si].dayOfWeek}`)
  }
  for (const u of units)
    for (const wid of domains[u.id]) for (const si of ctx.windows[wid]) slotDemand[si] += 1
  const dropDemand = (unitId: number): void => {
    for (const wid of domains[unitId]) for (const si of ctx.windows[wid]) slotDemand[si] -= 1
  }
  const dayOf = (si: number): number => ctx.slots[si].dayOfWeek
  const teacherDayKey = (teacherId: number, day: number): string => `${teacherId}:${day}`
  const classSubjectDayKey = (classId: number, subjectId: number, day: number): string =>
    `${classId}:${subjectId}:${day}`

  const degree = new Int32Array(units.length)
  {
    const byClass = new Map<number, number>()
    const byTeacher = new Map<number, number>()
    for (const u of units) {
      for (const c of u.classIds) byClass.set(c, (byClass.get(c) ?? 0) + 1)
      for (const t of u.teacherIds) byTeacher.set(t, (byTeacher.get(t) ?? 0) + 1)
    }
    for (const u of units) {
      let d = 0
      for (const c of u.classIds) d += byClass.get(c) ?? 0
      for (const t of u.teacherIds) d += byTeacher.get(t) ?? 0
      degree[u.id] = d
    }
  }

  /** 复合键：order 档 ×1e6 + 剩余可行数 ×1e2 − 度（度大的先排） */
  const keyOf = (unitId: number, feasible: number): number =>
    units[unitId].order * 1_000_000 + feasible * 100 - Math.min(99, degree[unitId] / 32)

  const countFeasible = (unitId: number, limit = Number.MAX_SAFE_INTEGER): number => {
    const u = units[unitId]
    let n = 0
    for (const wid of domains[unitId]) {
      if (board.canPlace(u, wid).ok) {
        n += 1
        if (n >= limit) break
      }
    }
    return n
  }

  const heap = new LazyHeap()
  for (const u of units) heap.push(keyOf(u.id, domains[u.id].length), u.id)

  const done = new Set<number>()
  const unplaced: number[] = []

  while (heap.size > 0) {
    const top = heap.pop()!
    if (done.has(top.unit)) continue
    const u = units[top.unit]
    const feasible = countFeasible(u.id)
    const realKey = keyOf(u.id, feasible)
    if (realKey > top.key + 1e-9) {
      // 可行数变少了（键变大），压回去让真正最紧的先出队
      heap.push(realKey, u.id)
      continue
    }
    done.add(u.id)

    if (feasible === 0) {
      unplaced.push(u.id)
      dropDemand(u.id)
      continue
    }

    // LCV：对未来伤害最小的窗口
    let best: { wid: number; roomIds: (number | null)[]; score: number } | null = null
    for (const wid of domains[u.id]) {
      const probe = board.canPlace(u, wid)
      if (!probe.ok) continue
      let score = 0
      for (const si of ctx.windows[wid]) score += slotDemand[si]
      // 事实连堂罚分（2026-09-30 用户要求）：没配置连堂的课绝不与同班同学科挨着，
      // 除非整个值域只剩挨着的落点。S16 又加入了首节填充奖励，因此把这一项提升
      // 到 10000/次，继续保证“零事实连堂”优先于全部构造期软偏好。
      score += board.sameSubjectContacts(u, ctx.windows[wid]) * 10_000
      if (softOptimize) {
        const days = new Set(ctx.windows[wid].map(dayOf))
        for (const day of days) {
          for (const teacherId of u.teacherIds) {
            const teacherKey = teacherDayKey(teacherId, day)
            const n = teacherDay.get(teacherKey) ?? 0
            score += n * n * 18
            const periods = [...(teacherDayPeriods.get(teacherKey) ?? [])]
            for (const si of ctx.windows[wid]) {
              if (dayOf(si) === day) periods.push(ctx.slots[si].periodIndex)
            }
            if (periods.length > 1) {
              const min = Math.min(...periods)
              const max = Math.max(...periods)
              score += (max - min + 1 - new Set(periods).size) * 120
            }
          }
          const firstSlotId = firstSlots.get(stageDayKey(u.stageId, day))
          const fillsFirst =
            firstSlotId != null && ctx.windows[wid].some((si) => ctx.slots[si].id === firstSlotId)
          for (const classId of u.classIds) {
            const n = classSubjectDay.get(classSubjectDayKey(classId, u.subjectId, day)) ?? 0
            score += n * n * 60
            // 班级当天第一节空堂（S16）给显著构造期惩罚。用“填第一节”的奖励
            // 实现，既不把它升级成硬约束，也不会在受限课表中制造无解。
            if (fillsFirst && !classDayFirstFilled.has(`${classId}:${day}`)) score -= 300
          }
          if (
            u.importance >= 4 &&
            ctx.windows[wid].some((si) => dayOf(si) === day && ctx.slots[si].segment !== 'morning')
          )
            score += 100
        }
      }
      score = score * 0.6 + rng.next() // 同分随机打散 → 多起点能产生不同解
      if (best == null || score < best.score) best = { wid, roomIds: probe.roomIds, score }
    }
    if (!best) {
      unplaced.push(u.id)
      dropDemand(u.id)
      continue
    }
    board.place(u, best.wid, best.roomIds)
    if (softOptimize)
      for (const day of new Set(ctx.windows[best.wid].map(dayOf))) {
        for (const teacherId of u.teacherIds) {
          const k = teacherDayKey(teacherId, day)
          teacherDay.set(k, (teacherDay.get(k) ?? 0) + u.size)
          const periods = teacherDayPeriods.get(k) ?? []
          for (const si of ctx.windows[best.wid]) {
            if (dayOf(si) === day) periods.push(ctx.slots[si].periodIndex)
          }
          teacherDayPeriods.set(k, periods)
        }
        const firstSlotId = firstSlots.get(stageDayKey(u.stageId, day))
        const fillsFirst =
          firstSlotId != null &&
          ctx.windows[best.wid].some((si) => ctx.slots[si].id === firstSlotId)
        for (const classId of u.classIds) {
          const k = classSubjectDayKey(classId, u.subjectId, day)
          classSubjectDay.set(k, (classSubjectDay.get(k) ?? 0) + u.size)
          if (fillsFirst) classDayFirstFilled.add(`${classId}:${day}`)
        }
      }
    dropDemand(u.id)
  }

  return { board, unplaced }
}
