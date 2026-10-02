/**
 * AC-3 弧一致性裁剪（docs/04 §3.2）。
 *
 * 分两步：
 *   一、节点一致性：把「基线占用（预排锁定 H7）」「场地一个都放不下（H3/H3b/H6）」
 *       这类与其他单元无关的窗口，直接从值域里剔掉。
 *   二、弧一致性：对共享班级 / 教师 / 硬互斥组的单元两两传播 —— 当邻居的值域塌缩成
 *       单点 w 时，w 覆盖的时段对本单元就不可用了，剔除后继续向外传播。
 *       8400 个单元显式建边会有千万级边，这里用「班级 / 教师 → 成员列表」的
 *       **隐式冲突组**表达邻接，不存边。
 *
 * 任一单元值域被清空 ⇒ 立即判定不可行，wipeouts 里带出是谁，交给诊断模块解释原因。
 */
import type { SolverContext } from './context'
import { Board } from './board'

export interface Ac3Result {
  domains: number[][]
  /** 值域被裁空的单元 */
  wipeouts: number[]
  /** 共剔除多少个 (单元, 窗口) 组合 */
  removed: number
}

function buildNeighbors(ctx: SolverContext): number[][] {
  const byClass = new Map<number, number[]>()
  const byTeacher = new Map<number, number[]>()
  const byMutex = new Map<number, number[]>()
  const push = (m: Map<number, number[]>, k: number, v: number): void => {
    const arr = m.get(k)
    if (arr) arr.push(v)
    else m.set(k, [v])
  }
  for (const u of ctx.units) {
    for (const c of u.classIds) push(byClass, c, u.id)
    for (const t of u.teacherIds) push(byTeacher, t, u.id)
    for (const g of u.mutexGroupIds) push(byMutex, g, u.id)
  }
  return ctx.units.map((u) => {
    const s = new Set<number>()
    for (const c of u.classIds) for (const v of byClass.get(c) ?? []) if (v !== u.id) s.add(v)
    for (const t of u.teacherIds) for (const v of byTeacher.get(t) ?? []) if (v !== u.id) s.add(v)
    for (const g of u.mutexGroupIds) for (const v of byMutex.get(g) ?? []) if (v !== u.id) s.add(v)
    return [...s]
  })
}

export function ac3(ctx: SolverContext, input?: number[][]): Ac3Result {
  const domains = (input ?? ctx.domains).map((d) => [...d])
  let removed = 0

  // ── 一、节点一致性：基线占用与场地可行性 ───────────────────────────
  const probe = new Board(ctx) // 空棋盘 = 只含预排占位的基线
  for (const u of ctx.units) {
    const kept = domains[u.id].filter((wid) => probe.canPlace(u, wid).ok)
    removed += domains[u.id].length - kept.length
    domains[u.id] = kept
  }

  // ── 二、弧一致性传播 ───────────────────────────────────────────────
  const neighbors = buildNeighbors(ctx)
  const queue: number[] = ctx.units.filter((u) => domains[u.id].length === 1).map((u) => u.id)
  const inQueue = new Set(queue)

  while (queue.length > 0) {
    const vId = queue.shift()!
    inQueue.delete(vId)
    if (domains[vId].length !== 1) continue
    const v = ctx.units[vId]
    const taken = new Set(ctx.windows[domains[vId][0]])
    for (const uId of neighbors[vId]) {
      const u = ctx.units[uId]
      if ((u.weekMask & v.weekMask) === 0) continue // 单双周错开，互不影响
      if (domains[uId].length === 0) continue
      const kept = domains[uId].filter((wid) => !ctx.windows[wid].some((si) => taken.has(si)))
      if (kept.length === domains[uId].length) continue
      removed += domains[uId].length - kept.length
      domains[uId] = kept
      if (kept.length === 1 && !inQueue.has(uId)) {
        queue.push(uId)
        inQueue.add(uId)
      }
    }
  }

  return {
    domains,
    wipeouts: ctx.units.filter((u) => domains[u.id].length === 0).map((u) => u.id),
    removed
  }
}
