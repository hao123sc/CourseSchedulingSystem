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
  opts: { board?: Board } = {}
): ConstructResult {
  const board = opts.board ?? new Board(ctx)
  const units = ctx.units

  // 还没排的单元对各时段的需求热度，用于 LCV
  const slotDemand = new Int32Array(ctx.slots.length)
  for (const u of units) for (const wid of domains[u.id]) for (const si of ctx.windows[wid]) slotDemand[si] += 1
  const dropDemand = (unitId: number): void => {
    for (const wid of domains[unitId]) for (const si of ctx.windows[wid]) slotDemand[si] -= 1
  }

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
    let best: { wid: number; roomId: number | null; score: number } | null = null
    for (const wid of domains[u.id]) {
      const probe = board.canPlace(u, wid)
      if (!probe.ok) continue
      let score = 0
      for (const si of ctx.windows[wid]) score += slotDemand[si]
      score = score * 0.6 + rng.next() // 同分随机打散 → 多起点能产生不同解
      if (best == null || score < best.score) best = { wid, roomId: probe.roomId, score }
    }
    if (!best) {
      unplaced.push(u.id)
      dropDemand(u.id)
      continue
    }
    board.place(u, best.wid, best.roomId)
    dropDemand(u.id)
  }

  return { board, unplaced }
}
