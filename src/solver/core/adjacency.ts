/**
 * 相邻性与「事实连堂」（2026-09-30 用户要求新增）。
 *
 * 口径：只有教学任务里**显式配置了连堂**（consecutiveCount × consecutiveSize）的课
 * 才允许同班同学科落在相邻节次；其余情况下的同学科相邻 = **事实连堂**，
 * 构造（DSATUR）与修复（min-conflicts）阶段都要尽量避开。
 * 它是**强偏好，不是硬约束**——紧学段挤不下时照样排满，绝不为它牺牲「排满 / 零违反」。
 *
 * 「相邻」的定义与连堂窗口（H10）完全一致：同一天、同一分段（上午/下午/晚上）、
 * periodIndex 逐节递增；中间夹了非教学槽（课间操/午休）或跨分段就不算相邻。
 */
import type { SolverContext } from './context'
import type { Solution } from '../model/solution'
import type { SolverSlot } from '../model/types'

/**
 * slotIdx → 同日同分段、periodIndex 逐节递增的前/后一个教学槽（没有则 -1）。
 * 与 buildContext 的连堂窗口枚举用同一套分组与相邻性规则，保证两处口径永远一致。
 */
export function buildSlotNeighbors(slots: SolverSlot[]): { prev: Int32Array; next: Int32Array } {
  const prev = new Int32Array(slots.length).fill(-1)
  const next = new Int32Array(slots.length).fill(-1)
  const groups = new Map<string, { slot: SolverSlot; i: number }[]>()
  slots.forEach((slot, i) => {
    if (!slot.isTeaching) return
    const k = `${slot.stageId}#${slot.dayOfWeek}#${slot.segment}`
    const arr = groups.get(k)
    if (arr) arr.push({ slot, i })
    else groups.set(k, [{ slot, i }])
  })
  for (const group of groups.values()) {
    group.sort((a, b) => a.slot.periodIndex - b.slot.periodIndex || a.slot.id - b.slot.id)
    for (let k = 1; k < group.length; k++) {
      if (group[k].slot.periodIndex === group[k - 1].slot.periodIndex + 1) {
        next[group[k - 1].i] = group[k].i
        prev[group[k].i] = group[k - 1].i
      }
    }
  }
  return { prev, next }
}

/**
 * 统计解里的「事实连堂」对数：同班、同学科、相邻节次（按周掩码有交集的周里真的挨着）、
 * 且两节课**不属于同一个连堂块单元**。预排锁定的课也参与统计（它和排出来的课挨着一样扎眼）。
 * 同一对槽位在单/双周两个平面都相邻时只计一次。
 */
export function countAccidentalBlocks(ctx: SolverContext, sol: Solution): number {
  const S = ctx.slots.length
  const C = ctx.input.classes.length
  // (classIdx * S + slotIdx) * 2 + plane（plane 0 = 单周，1 = 双周）
  const owner = new Int32Array(C * S * 2).fill(-2) // -2 = 空；≥0 = unitId；< -1 = 预排（每条一个负数）
  const subject = new Int32Array(C * S * 2).fill(-1)

  ctx.fixedPlacements.forEach((fp, i) => {
    if (fp.subjectId == null) return
    const ci = ctx.classIdx.get(fp.classId)
    const si = ctx.slotIdx.get(fp.slotId)
    if (ci == null || si == null) return
    const base = (ci * S + si) * 2
    owner[base] = owner[base + 1] = -2 - i
    subject[base] = subject[base + 1] = fp.subjectId
  })

  for (const [unitId, a] of sol.assignments) {
    const u = ctx.units[unitId]
    if (!u) continue
    for (const slotId of a.slotIds) {
      const si = ctx.slotIdx.get(slotId)
      if (si == null) continue
      for (const c of u.classIds) {
        const ci = ctx.classIdx.get(c)
        if (ci == null) continue
        const base = (ci * S + si) * 2
        if (u.weekMask & 0b01) {
          owner[base] = unitId
          subject[base] = u.subjectId
        }
        if (u.weekMask & 0b10) {
          owner[base + 1] = unitId
          subject[base + 1] = u.subjectId
        }
      }
    }
  }

  let count = 0
  for (let ci = 0; ci < C; ci++) {
    for (let si = 0; si < S; si++) {
      const nj = ctx.slotNext[si]
      if (nj < 0) continue
      for (let plane = 0; plane < 2; plane++) {
        const x = (ci * S + si) * 2 + plane
        const y = (ci * S + nj) * 2 + plane
        if (
          subject[x] >= 0 &&
          subject[x] === subject[y] && // 同学科
          owner[x] !== owner[y] && // 不属于同一个连堂块（或两条不同的预排）
          owner[x] !== -2 &&
          owner[y] !== -2
        ) {
          count += 1
          break // 单/双周两个平面都相邻只算一次
        }
      }
    }
  }
  return count
}
