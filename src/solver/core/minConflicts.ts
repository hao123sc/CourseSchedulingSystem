/**
 * 阶段 1.4：min-conflicts 修复（docs/04 §4.3）。
 *
 * DSATUR 贪心难免留下几个塞不进去的单元。做法是：
 *   从未排队列里挑一个，放进**需要顶掉的已排课最少**的窗口，
 *   被顶掉的课重新入队，如此迭代。迭代上限 50|L|，带随机重启前的禁忌打散。
 *
 * 关键：**任何时刻棋盘上都没有硬约束冲突**——我们不是"先放冲突再消解"，
 * 而是"先腾位置再放"，所以中途随时中断，已排部分也是合法的。
 */
import type { SolverContext } from './context'
import type { Board } from './board'
import type { Rng } from './random'

export interface RepairOptions {
  /** 迭代上限，默认 50|L| */
  maxIterations?: number
  /** 到点就停（毫秒时间戳），由外层时间预算控制 */
  deadline?: number
  now?: () => number
  onProgress?: (done: number, total: number) => void
  cancelled?: () => boolean
}

export function minConflictsRepair(
  ctx: SolverContext,
  board: Board,
  domains: number[][],
  unplaced: number[],
  rng: Rng,
  opts: RepairOptions = {}
): number[] {
  const now = opts.now ?? ((): number => Date.now())
  const maxIter = opts.maxIterations ?? 50 * Math.max(1, ctx.units.length)
  const queue = [...unplaced]
  /** 最近被顶掉的次数，用来避免两个单元互相顶来顶去 */
  const evictions = new Int32Array(ctx.units.length)
  const total = queue.length
  /** 反复放不下、已放弃继续折腾的单元，留给诊断报告解释 */
  const givenUp = new Set<number>()
  let iter = 0

  while (queue.length > 0 && iter < maxIter) {
    iter += 1
    if (opts.deadline != null && now() > opts.deadline) break
    if (opts.cancelled?.()) break

    // 优先修被顶得最少的（顶得多的说明它很难放，留到后面免得抖动）
    queue.sort((a, b) => evictions[a] - evictions[b])
    const unitId = queue.shift()!
    const u = ctx.units[unitId]

    // 1) 先试直接放：可行的落点里挑「事实连堂」接触最少的（有得选就绝不挨着）
    let direct: { wid: number; roomIds: (number | null)[]; contacts: number } | null = null
    for (const wid of rng.shuffle(domains[unitId])) {
      const probe = board.canPlace(u, wid)
      if (!probe.ok) continue
      const contacts = board.sameSubjectContacts(u, ctx.windows[wid])
      if (direct == null || contacts < direct.contacts) {
        direct = { wid, roomIds: probe.roomIds, contacts }
        if (contacts === 0) break
      }
    }
    if (direct) {
      board.place(u, direct.wid, direct.roomIds)
      opts.onProgress?.(total - queue.length, total)
      continue
    }

    // 2) 找"顶掉的课最少"的窗口（同为最少时挑事实连堂接触也最少的）
    let best: { wid: number; victims: number[]; contacts: number } | null = null
    for (const wid of domains[unitId]) {
      const victims = board.blockers(u, wid).filter((v) => evictions[v] < 8)
      if (victims.length === 0) continue // 顶不动（阻塞来自预排锁定 H7）
      const contacts = board.sameSubjectContacts(u, ctx.windows[wid])
      if (
        best == null ||
        victims.length < best.victims.length ||
        (victims.length === best.victims.length && contacts < best.contacts)
      ) {
        best = { wid, victims, contacts }
      }
      if (best.victims.length === 1 && best.contacts === 0) break
    }
    if (!best) {
      queue.push(unitId)
      evictions[unitId] += 1
      if (evictions[unitId] > 12) {
        // 这个单元反复放不下，不再折腾，留给诊断报告
        queue.splice(queue.indexOf(unitId), 1)
        givenUp.add(unitId)
      }
      continue
    }

    for (const v of best.victims) {
      board.remove(v)
      evictions[v] += 1
      queue.push(v)
    }
    const probe = board.canPlace(u, best.wid)
    if (probe.ok) {
      board.place(u, best.wid, probe.roomIds)
    } else {
      // 顶掉之后仍放不下（多半是场地容量），退回去等下一轮
      queue.push(unitId)
      evictions[unitId] += 1
    }
    opts.onProgress?.(total - queue.length, total)
  }

  const rest = new Set<number>([...queue, ...givenUp])
  return [...rest].filter((id) => !board.assignments.has(id))
}
