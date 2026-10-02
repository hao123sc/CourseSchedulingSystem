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
  /** 各班落位的场地，与 Unit.classIds 一一对应 */
  roomIds: (number | null)[]
}

export class Board {
  readonly occ: Occupancy
  readonly assignments = new Map<number, Assignment>()
  /** slotIdx → 落在该 slot 上的 unitId 集合（min-conflicts 找"顶掉谁"用） */
  readonly unitsBySlot: Set<number>[]
  private readonly windowOf = new Map<number, number>()

  /**
   * 「班 × 槽 → 学科」两张单双周平面（[ci * S + si]），-1 = 空。
   * **不是硬约束状态**，只服务「事实连堂」强偏好（core/adjacency.ts）：
   * 放置时看窗口两端的邻居槽是否已是同学科，是则加罚分。
   * 预排锁定的课（kind='lesson' 且带学科）一开始就压进来，剩余课时会主动避开它。
   */
  private readonly subjOdd: Int32Array
  private readonly subjEven: Int32Array

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

    const S = ctx.slots.length
    this.subjOdd = new Int32Array(ctx.input.classes.length * S).fill(-1)
    this.subjEven = new Int32Array(ctx.input.classes.length * S).fill(-1)
    for (const fp of ctx.fixedPlacements) {
      if (fp.subjectId == null) continue
      const ci = ctx.classIdx.get(fp.classId)
      const si = ctx.slotIdx.get(fp.slotId)
      if (ci == null || si == null) continue
      this.subjOdd[ci * S + si] = fp.subjectId
      this.subjEven[ci * S + si] = fp.subjectId
    }
  }

  /**
   * 把 u 放到 slotIds 上会与多少节「同班同学科」的课**挨着**（事实连堂接触数）。
   * 只查窗口首槽的前一个 / 末槽的后一个邻居——窗口内部（显式连堂块）不算。
   * 单双周按周掩码交集判定：奇偶错开的两节课在任何一周都不会真的挨着。
   */
  sameSubjectContacts(u: Unit, slotIds: number[]): number {
    if (slotIds.length === 0) return 0
    const S = this.ctx.slots.length
    const edges = [this.ctx.slotPrev[slotIds[0]], this.ctx.slotNext[slotIds[slotIds.length - 1]]]
    let n = 0
    for (const e of edges) {
      if (e < 0) continue
      for (const c of u.classIds) {
        const ci = this.ctx.classIdx.get(c)
        if (ci == null) continue
        if (u.weekMask & 0b01 && this.subjOdd[ci * S + e] === u.subjectId) n += 1
        if (u.weekMask & 0b10 && this.subjEven[ci * S + e] === u.subjectId) n += 1
      }
    }
    return n
  }

  /** 某个班在某场地要占的班位数（拼合组里每个班各占各的，不相加） */
  private slotsTakenOn(u: Unit, roomId: number): number {
    const opt = u.roomOptions.find((o) => o.roomId === roomId)
    return opt ? opt.slotsTaken : 1
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

  /**
   * 为单元里的**每个班**各挑一个可用场地。
   *
   * 口径（2026-09-29 确认）：拼合 / 同时上课组只要求**同一时段**，
   * 场地各班各占各的，人数按单班核（H3b），班位按单班计（H3）。
   * 两个班拼班上通用技术 = 同时占用通用技术室 1 和 2，而不是挤进同一间。
   * 因此这里要在本次放置内部维护一份"临时增量"，避免两个班选到同一间把容量吃爆。
   */
  private pickRooms(u: Unit, slotIds: number[]): { ok: boolean; roomIds: (number | null)[] } {
    const pending = new Map<string, number>() // `roomIdx#slotIdx` → 本次放置已预占的班位
    const roomIds: (number | null)[] = []

    for (let k = 0; k < u.classIds.length; k++) {
      const seats = u.studentCounts[k] ?? u.studentCount
      const home = u.classIds.length > 0 ? this.ctx.homeRoomOf.get(u.classIds[k]) ?? null : null
      // ★ 需专用教室的课（H6）只认候选清单，**绝不回退到班级固定教室**：
      //   回退会让"实验课排进普通教室"这种错误静悄悄地通过。
      const options = u.needRoom
        ? u.roomOptions
        : u.roomOptions.length > 0
          ? u.roomOptions
          : home != null
            ? [{ roomId: home, slotsTaken: 1, priority: 0 }]
            : []
      if (options.length === 0) {
        if (u.needRoom) return { ok: false, roomIds: [] }
        roomIds.push(null) // 无场地要求且没有固定教室 → 这节课不占场地
        continue
      }

      let best: { roomId: number; load: number } | null = null
      for (const o of [...options].sort((a, b) => a.priority - b.priority)) {
        const ri = this.ctx.roomIdx.get(o.roomId)
        if (ri == null) continue
        if (this.ctx.roomSeats[ri] < seats) continue // H3b 人数容量
        const need = o.slotsTaken
        let fits = true
        let load = 0
        for (const si of slotIds) {
          const extra = pending.get(`${ri}#${si}`) ?? 0
          if (
            !this.occ.rooms.fits(ri, si, u.weekMask, need + extra, this.ctx.roomConcurrent[ri])
          ) {
            fits = false
            break
          }
          load += this.occ.rooms.peak(ri, si, u.weekMask) + extra
        }
        // 同优先级里挑最空的，避免都挤田径场（S15 的雏形，M5 再细化）
        if (fits && (best == null || load < best.load)) best = { roomId: o.roomId, load }
      }
      if (!best) return { ok: false, roomIds: [] }
      roomIds.push(best.roomId)
      const ri = this.ctx.roomIdx.get(best.roomId)!
      for (const si of slotIds) {
        pending.set(`${ri}#${si}`, (pending.get(`${ri}#${si}`) ?? 0) + this.slotsTakenOn(u, best.roomId))
      }
    }
    return { ok: true, roomIds }
  }

  canPlace(u: Unit, windowId: number): PlacementProbe {
    const slotIds = this.ctx.windows[windowId]
    if (!this.nonRoomFree(u, slotIds)) return { ok: false, roomIds: [] }
    const rooms = this.pickRooms(u, slotIds)
    if (!rooms.ok) return { ok: false, roomIds: [] }
    return { ok: true, roomIds: rooms.roomIds }
  }

  place(u: Unit, windowId: number, roomIds: (number | null)[]): void {
    const slotIds = this.ctx.windows[windowId]
    const S = this.ctx.slots.length
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
      for (const roomId of roomIds) {
        if (roomId == null) continue
        const ri = this.ctx.roomIdx.get(roomId)
        if (ri != null) this.occ.rooms.occupy(ri, si, u.weekMask, this.slotsTakenOn(u, roomId))
      }
      this.unitsBySlot[si].add(u.id)
      // 事实连堂平面（仅偏好判定用，非硬约束状态）
      for (const c of u.classIds) {
        const ci = this.ctx.classIdx.get(c)
        if (ci == null) continue
        if (u.weekMask & 0b01) this.subjOdd[ci * S + si] = u.subjectId
        if (u.weekMask & 0b10) this.subjEven[ci * S + si] = u.subjectId
      }
    }
    this.assignments.set(u.id, {
      unitId: u.id,
      slotId: this.ctx.slots[slotIds[0]].id,
      slotIds: slotIds.map((si) => this.ctx.slots[si].id),
      roomIds: [...roomIds],
      roomId: roomIds[0] ?? null
    })
    this.windowOf.set(u.id, windowId)
  }

  remove(unitId: number): void {
    const a = this.assignments.get(unitId)
    const windowId = this.windowOf.get(unitId)
    if (!a || windowId == null) return
    const u = this.ctx.units[unitId]
    const S = this.ctx.slots.length
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
      for (const roomId of a.roomIds) {
        if (roomId == null) continue
        const ri = this.ctx.roomIdx.get(roomId)
        if (ri != null) this.occ.rooms.release(ri, si, u.weekMask, this.slotsTakenOn(u, roomId))
      }
      this.unitsBySlot[si].delete(unitId)
      for (const c of u.classIds) {
        const ci = this.ctx.classIdx.get(c)
        if (ci == null) continue
        if (u.weekMask & 0b01) this.subjOdd[ci * S + si] = -1
        if (u.weekMask & 0b10) this.subjEven[ci * S + si] = -1
      }
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
    const wanted = new Set<number>(
      u.roomOptions.length > 0
        ? u.roomOptions.map((o) => o.roomId)
        : u.homeRoomId != null
          ? [u.homeRoomId]
          : []
    )
    for (const si of slotIds) {
      for (const other of this.unitsBySlot[si]) {
        if (other === u.id) continue
        const a = this.assignments.get(other)
        if (a?.roomIds.some((r) => r != null && wanted.has(r))) out.add(other)
      }
    }
    return [...out]
  }

  toSolution(seed: number, unplaced: number[]): Solution {
    return {
      assignments: new Map(
        [...this.assignments].map(([k, v]) => [
          k,
          { ...v, slotIds: [...v.slotIds], roomIds: [...v.roomIds] }
        ])
      ),
      unplaced: [...unplaced],
      seed
    }
  }
}
