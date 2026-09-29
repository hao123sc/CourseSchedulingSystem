/**
 * 棋盘：占用结构 + 当前指派的可变状态，构造（DSATUR）与修复（min-conflicts）都在它上面走。
 *
 * 所有硬约束的**放置期**判定集中在这里：
 *   H1 班级唯一   —— classes 位图按位与
 *   H2 教师唯一   —— teachers 位图按位与
 *   H3 场地并发   —— rooms 计数器 + concurrent_capacity
 *   H3b 人数容量  —— 建模期已把坐不下的场地剔出候选，这里再兜一次
 *   H5 禁排       —— 建模期已从值域剔除
 *   H7 预排锁定   —— 基线占用 base 一开始就压进来了
 *   H8 硬互斥组   —— groups 计数器 + max_concurrent
 *   H9 同槽组     —— 复合单元天然同槽
 *   H10 连堂完整  —— 值域即「窗口 id」，窗口本身就是同日相邻同分段的
 */
import type { SolverContext } from './context'
import { Occupancy } from './occupancy'
import type { Assignment, Solution, Unit } from '../model/solution'

export interface PlacementProbe {
  ok: boolean
  roomId: number | null
  /** 该场地/班级/教师上要占的班位数（无场地时为 0） */
  roomSlotsTaken: number
}

export class Board {
  readonly occ: Occupancy
  readonly assignments = new Map<number, Assignment>()
  /** slotIdx → 落在该 slot 上的 unitId 集合（min-conflicts 找"顶掉谁"用） */
  readonly unitsBySlot: Set<number>[]
  private readonly windowOf = new Map<number, number>()

  constructor(readonly ctx: SolverContext) {
    this.occ = new Occupancy({
      classes: ctx.input.classes.length,
      teachers: ctx.input.teachers.length,
      rooms: ctx.input.rooms.length,
      groups: Math.max(1, ctx.groupCapacity.length),
      slots: ctx.slots.length
    })
    // 预排占位是基线：复制一份，保证 H7 永远不会被侵占
    this.occ.classes.words.set(ctx.base.classes.words)
    this.occ.teachers.words.set(ctx.base.teachers.words)
    this.occ.rooms.odd.set(ctx.base.rooms.odd)
    this.occ.rooms.even.set(ctx.base.rooms.even)
    this.unitsBySlot = ctx.slots.map(() => new Set<number>())
  }

  /** 该单元在该场地需要占的班位数 */
  private slotsTakenOn(u: Unit, roomId: number): number {
    const opt = u.roomOptions.find((o) => o.roomId === roomId)
    const per = opt ? opt.slotsTaken : 1
    return per * Math.max(1, u.classIds.length)
  }

  /** 班级 / 教师 / 互斥组是否都空着（不含场地） */
  private nonRoomFree(u: Unit, slotIds: number[]): boolean {
    for (const si of slotIds) {
      for (const c of u.classIds) {
        const ci = this.ctx.classIdx.get(c)
        if (ci != null && this.occ.classes.conflicts(ci, si, u.weekMask)) return false
      }
      for (const t of u.teacherIds) {
        const ti = this.ctx.teacherIdx.get(t)
        if (ti != null && this.occ.teachers.conflicts(ti, si, u.weekMask)) return false
      }
      for (const gi of u.mutexGroupIds) {
        if (!this.occ.groups.fits(gi, si, u.weekMask, 1, this.ctx.groupCapacity[gi])) return false
      }
    }
    return true
  }

  /** 在给定窗口上挑一个可用场地；返回 null 表示这节课不占场地资源 */
  private pickRoom(u: Unit, slotIds: number[]): { ok: boolean; roomId: number | null } {
    // ★ 需专用教室的课（H6）只认候选清单，**绝不回退到班级固定教室**：
    //   回退会让"实验课排进普通教室"这种错误静悄悄地通过。
    const options = u.needRoom
      ? u.roomOptions
      : u.roomOptions.length > 0
        ? u.roomOptions
        : u.homeRoomId != null
          ? [{ roomId: u.homeRoomId, slotsTaken: 1, priority: 0 }]
          : []
    // 无场地要求且班级没有固定教室 → 不占场地（H3 不适用）
    if (options.length === 0) return { ok: !u.needRoom, roomId: null }

    let best: { roomId: number; load: number } | null = null
    for (const o of [...options].sort((a, b) => a.priority - b.priority)) {
      const ri = this.ctx.roomIdx.get(o.roomId)
      if (ri == null) continue
      if (this.ctx.roomSeats[ri] < u.studentCount) continue // H3b
      const need = this.slotsTakenOn(u, o.roomId)
      let fits = true
      let load = 0
      for (const si of slotIds) {
        if (!this.occ.rooms.fits(ri, si, u.weekMask, need, this.ctx.roomConcurrent[ri])) {
          fits = false
          break
        }
        load += this.occ.rooms.peak(ri, si, u.weekMask)
      }
      // 优先级相同的场地里挑最空的，避免都挤田径场（S15 的雏形，M5 再细化）
      if (fits && (best == null || load < best.load)) best = { roomId: o.roomId, load }
    }
    return best ? { ok: true, roomId: best.roomId } : { ok: false, roomId: null }
  }

  canPlace(u: Unit, windowId: number): PlacementProbe {
    const slotIds = this.ctx.windows[windowId]
    if (!this.nonRoomFree(u, slotIds)) return { ok: false, roomId: null, roomSlotsTaken: 0 }
    const room = this.pickRoom(u, slotIds)
    if (!room.ok) return { ok: false, roomId: null, roomSlotsTaken: 0 }
    return {
      ok: true,
      roomId: room.roomId,
      roomSlotsTaken: room.roomId == null ? 0 : this.slotsTakenOn(u, room.roomId)
    }
  }

  place(u: Unit, windowId: number, roomId: number | null): void {
    const slotIds = this.ctx.windows[windowId]
    for (const si of slotIds) {
      for (const c of u.classIds) {
        const ci = this.ctx.classIdx.get(c)
        if (ci != null) this.occ.classes.occupy(ci, si, u.weekMask)
      }
      for (const t of u.teacherIds) {
        const ti = this.ctx.teacherIdx.get(t)
        if (ti != null) this.occ.teachers.occupy(ti, si, u.weekMask)
      }
      for (const gi of u.mutexGroupIds) this.occ.groups.occupy(gi, si, u.weekMask, 1)
      if (roomId != null) {
        const ri = this.ctx.roomIdx.get(roomId)
        if (ri != null) this.occ.rooms.occupy(ri, si, u.weekMask, this.slotsTakenOn(u, roomId))
      }
      this.unitsBySlot[si].add(u.id)
    }
    this.assignments.set(u.id, {
      unitId: u.id,
      slotId: this.ctx.slots[slotIds[0]].id,
      slotIds: slotIds.map((si) => this.ctx.slots[si].id),
      roomId
    })
    this.windowOf.set(u.id, windowId)
  }

  remove(unitId: number): void {
    const a = this.assignments.get(unitId)
    const windowId = this.windowOf.get(unitId)
    if (!a || windowId == null) return
    const u = this.ctx.units[unitId]
    for (const si of this.ctx.windows[windowId]) {
      for (const c of u.classIds) {
        const ci = this.ctx.classIdx.get(c)
        if (ci != null) this.occ.classes.release(ci, si, u.weekMask)
      }
      for (const t of u.teacherIds) {
        const ti = this.ctx.teacherIdx.get(t)
        if (ti != null) this.occ.teachers.release(ti, si, u.weekMask)
      }
      for (const gi of u.mutexGroupIds) this.occ.groups.release(gi, si, u.weekMask, 1)
      if (a.roomId != null) {
        const ri = this.ctx.roomIdx.get(a.roomId)
        if (ri != null) this.occ.rooms.release(ri, si, u.weekMask, this.slotsTakenOn(u, a.roomId))
      }
      this.unitsBySlot[si].delete(unitId)
    }
    this.assignments.delete(unitId)
    this.windowOf.delete(unitId)
  }

  windowIdOf(unitId: number): number | undefined {
    return this.windowOf.get(unitId)
  }

  /**
   * 若强行把 u 放到 windowId 上，需要先顶掉哪些已排单元。
   * 只考虑班级 / 教师 / 互斥组（布尔资源）与场地（计数资源）四类占用者。
   */
  blockers(u: Unit, windowId: number): number[] {
    const slotIds = this.ctx.windows[windowId]
    const out = new Set<number>()
    for (const si of slotIds) {
      for (const other of this.unitsBySlot[si]) {
        if (other === u.id) continue
        const v = this.ctx.units[other]
        if ((v.weekMask & u.weekMask) === 0) continue // 单双周错开，不冲突
        const shareClass = v.classIds.some((c) => u.classIds.includes(c))
        const shareTeacher = v.teacherIds.some((t) => u.teacherIds.includes(t))
        const shareMutex = v.mutexGroupIds.some((g) => u.mutexGroupIds.includes(g))
        if (shareClass || shareTeacher || shareMutex) out.add(other)
      }
    }
    if (out.size > 0) return [...out]
    // 走到这里说明布尔资源都空着，那阻塞一定来自场地容量：顶掉同场地的占用者
    const wanted = new Set(
      (u.roomOptions.length > 0
        ? u.roomOptions.map((o) => o.roomId)
        : u.homeRoomId != null
          ? [u.homeRoomId]
          : []) as number[]
    )
    for (const si of slotIds) {
      for (const other of this.unitsBySlot[si]) {
        if (other === u.id) continue
        const a = this.assignments.get(other)
        if (a?.roomId != null && wanted.has(a.roomId)) out.add(other)
      }
    }
    return [...out]
  }

  toSolution(seed: number, unplaced: number[]): Solution {
    return {
      assignments: new Map([...this.assignments].map(([k, v]) => [k, { ...v, slotIds: [...v.slotIds] }])),
      unplaced: [...unplaced],
      seed
    }
  }
}
