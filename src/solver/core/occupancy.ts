/**
 * 占用结构 —— 引擎最内层的数据结构，所有可放置判定都走这里。
 *
 * ★ 三类资源结构**不同**，切勿混用（docs/04 §3.1、PROGRESS.md 易错点）：
 *
 *   班级 / 教师 —— 占用是**布尔**的（容量恒为 1）→ 位图，判定即按位与
 *   场地       —— 占用是**整数**的（concurrent_capacity 可 >1）→ 计数器
 *   硬互斥组   —— 占用是整数的（max_concurrent，默认 1）→ 计数器
 *
 * 单双周（docs/04 §1.2）：每个 (资源, slot) 存 2 bit —— bit0 单周、bit1 双周。
 *   all = 0b11、odd = 0b01、even = 0b10，冲突 ⟺ 掩码按位与非零。
 *   计数器同理按「单周 / 双周」两份维护：
 *   文档写的是 all / odd / even 三份并要求 `all + odd ≤ cap` 且 `all + even ≤ cap`，
 *   这里用等价的两份（单周用量、双周用量）—— all 同时计入两份，判定条件完全一致，
 *   少一次加法且不会漏判。
 *
 * 索引一律用**稠密下标**（classIdx / teacherIdx / roomIdx / slotIdx），
 * id → 下标的映射由 SolverContext 负责，本文件只认下标。
 */

/** 每个格子 2 bit 的位图：容量为 1 的资源（班级、教师）用它 */
export class WeekBitmap {
  readonly words: Uint32Array
  constructor(
    readonly entities: number,
    readonly slots: number
  ) {
    // 每个 word 32 bit = 16 个格子
    this.words = new Uint32Array(Math.ceil((entities * slots) / 16) + 1)
  }

  private at(entity: number, slot: number): { w: number; sh: number } {
    const cell = entity * this.slots + slot
    return { w: cell >>> 4, sh: (cell & 15) * 2 }
  }

  /** 该格子已被占用的周掩码 */
  mask(entity: number, slot: number): number {
    const { w, sh } = this.at(entity, slot)
    return (this.words[w] >>> sh) & 0b11
  }

  /** 以 mask 占用是否冲突（H1 / H2） */
  conflicts(entity: number, slot: number, mask: number): boolean {
    return (this.mask(entity, slot) & mask) !== 0
  }

  occupy(entity: number, slot: number, mask: number): void {
    const { w, sh } = this.at(entity, slot)
    this.words[w] |= mask << sh
  }

  release(entity: number, slot: number, mask: number): void {
    const { w, sh } = this.at(entity, slot)
    this.words[w] &= ~(mask << sh)
  }

  clear(): void {
    this.words.fill(0)
  }
}

/**
 * 按周次分开计数的计数器：容量可 >1 的资源（场地并发容量 H3、硬互斥组 H8）用它。
 * `load[0]` = 单周用量，`load[1]` = 双周用量；weekMode='all' 两边都加。
 */
export class WeekCounter {
  readonly odd: Uint16Array
  readonly even: Uint16Array
  constructor(
    readonly entities: number,
    readonly slots: number
  ) {
    this.odd = new Uint16Array(entities * slots)
    this.even = new Uint16Array(entities * slots)
  }

  /** 以 mask 占用 amount 个位置后的峰值用量（取单/双周中的较大者） */
  peak(entity: number, slot: number, mask: number, amount = 0): number {
    const i = entity * this.slots + slot
    const o = mask & 0b01 ? this.odd[i] + amount : this.odd[i]
    const e = mask & 0b10 ? this.even[i] + amount : this.even[i]
    return Math.max(o, e)
  }

  fits(entity: number, slot: number, mask: number, amount: number, capacity: number): boolean {
    return this.peak(entity, slot, mask, amount) <= capacity
  }

  occupy(entity: number, slot: number, mask: number, amount: number): void {
    const i = entity * this.slots + slot
    if (mask & 0b01) this.odd[i] += amount
    if (mask & 0b10) this.even[i] += amount
  }

  release(entity: number, slot: number, mask: number, amount: number): void {
    const i = entity * this.slots + slot
    if (mask & 0b01) this.odd[i] -= amount
    if (mask & 0b10) this.even[i] -= amount
  }

  clear(): void {
    this.odd.fill(0)
    this.even.fill(0)
  }
}

/** 一次放置涉及的全部资源占用 */
export interface OccupancySnapshotSizes {
  classes: number
  teachers: number
  rooms: number
  groups: number
  slots: number
}

export class Occupancy {
  readonly classes: WeekBitmap
  readonly teachers: WeekBitmap
  readonly rooms: WeekCounter
  readonly groups: WeekCounter

  constructor(sizes: OccupancySnapshotSizes) {
    this.classes = new WeekBitmap(Math.max(1, sizes.classes), sizes.slots)
    this.teachers = new WeekBitmap(Math.max(1, sizes.teachers), sizes.slots)
    this.rooms = new WeekCounter(Math.max(1, sizes.rooms), sizes.slots)
    this.groups = new WeekCounter(Math.max(1, sizes.groups), sizes.slots)
  }

  clear(): void {
    this.classes.clear()
    this.teachers.clear()
    this.rooms.clear()
    this.groups.clear()
  }
}
