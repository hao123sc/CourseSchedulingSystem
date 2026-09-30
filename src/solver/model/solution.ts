/**
 * 求解侧建模：课时单元（Unit）、指派（Assignment）、解（Solution）、硬约束违反（HardViolation）。
 *
 * 纪律（docs/02 §3）：`src/solver/**` 纯 TS、零 IO，禁止 import Electron / Node。
 * 输入侧类型见 `./types.ts`（M2 已定稿，本轮不动）。
 *
 * ── 一个 Unit 是什么 ───────────────────────────────────────────────────────
 * 教学任务 t（班 c、科 s、师 p、周 n 节）被拆成若干个**课时单元**：
 *   · 连堂需求 consecutiveCount × consecutiveSize 先拆成 count 个 size 节的**块单元**
 *   · 剩余节数拆成若干个 1 节的单节单元
 *   · 已被 fixed_lesson(kind='lesson') 钉死的节数**先扣掉**（H4 课时守恒：
 *     待排节数 = weeklyPeriods − 已预排节数），否则会把钉死的课重复排一遍
 * 拼合 / 同时上课组（H9）里的多条任务合并成**一个** Unit，同时占用组内全部班级与教师，
 * 保证它们必然落在同一个 slot 上。
 */
import type { WeekMode } from '@shared/domain'

/** 单双周掩码：bit0 = 单周占用，bit1 = 双周占用。冲突 ⟺ 按位与非零（docs/04 §1.2） */
export const WEEK_MASK: Record<WeekMode, number> = {
  all: 0b11,
  odd: 0b01,
  even: 0b10
}

export interface UnitRoomOption {
  roomId: number
  /** 该学科在该场地占用的班位数（H3 并发容量） */
  slotsTaken: number
  priority: number
}

export interface Unit {
  /** 在 units 数组中的下标，引擎内部一律用它做主键 */
  id: number
  /** 来源教学任务（拼合组合并后可能有多条） */
  taskIds: number[]
  /** 占用的班级（H1）。拼合组 = 组内全部班级 */
  classIds: number[]
  /** 占用的教师（H2）。null 教师的任务不占教师资源 */
  teacherIds: number[]
  gradeIds: number[]
  stageId: number
  subjectId: number
  /** 连堂块的节数，单节 = 1（H10） */
  size: number
  weekMode: WeekMode
  /** WEEK_MASK[weekMode] */
  weekMask: number
  /** 需要专用教室（H6）：候选场地来自 subject_classroom；否则用班级固定教室 */
  needRoom: boolean
  /** 候选场地，空数组表示用 homeRoomId */
  roomOptions: UnitRoomOption[]
  /** 班级固定教室（普通课默认落这里） */
  homeRoomId: number | null
  /** 各班人数，与 classIds 一一对应（H3b 人数容量按**单班**核算） */
  studentCounts: number[]
  /** 各班人数的最大值，快速筛场地用 */
  studentCount: number
  importance: number
  /** 拼合 / 同时上课组 id（H9），仅用于诊断展示 */
  mergeGroupId: number | null
  /** 硬互斥组 id 列表（H8） */
  mutexGroupIds: number[]
  /** 排入顺序优先级，数字越小越先排（docs/04 §4.1） */
  order: number
}

export interface Assignment {
  unitId: number
  /** 块单元的起始 slot */
  slotId: number
  /** 块单元实际占用的全部 slot（size=1 时长度为 1） */
  slotIds: number[]
  /**
   * 各班落位的场地，与 Unit.classIds 一一对应；不占场地时为 null。
   * 拼合组（H9）是「同时段、各班各占一间场地」，所以这里是数组而不是单值 ——
   * 两个班拼班上通用技术，是分在通用技术室 1 和 2，不是挤进同一间。
   */
  roomIds: (number | null)[]
  /** 首个班级的场地，单班课（绝大多数）直接读它 */
  roomId: number | null
}

/** 落库时展开成一节一节的课（M3 后半段的 lesson 表结构对齐用） */
export interface PlacedLesson {
  /** 来源课时单元，同一连堂块的课共享同一个 unitId（落库时据此生成 consecutive_group） */
  unitId: number
  taskId: number
  classId: number
  subjectId: number
  teacherId: number | null
  classroomId: number | null
  slotId: number
  weekMode: WeekMode
  /** 同一连堂块内的节序（0 基），非连堂恒为 0 */
  blockIndex: number
  blockSize: number
}

export interface Solution {
  /** unitId → 指派；未排入的单元不在其中 */
  assignments: Map<number, Assignment>
  /** 未能落位的单元 id */
  unplaced: number[]
  /** 随机种子，便于复现 */
  seed: number
}

export type HardCode =
  | 'H1'
  | 'H2'
  | 'H3'
  | 'H3b'
  | 'H4'
  | 'H5'
  | 'H6'
  | 'H7'
  | 'H8'
  | 'H9'
  | 'H10'
  | 'H11'

export interface HardViolation {
  code: HardCode
  message: string
  unitIds: number[]
  slotId?: number
}

export function emptySolution(seed = 0): Solution {
  return { assignments: new Map(), unplaced: [], seed }
}

export function cloneSolution(sol: Solution): Solution {
  return {
    assignments: new Map(
      [...sol.assignments].map(([k, v]) => [
        k,
        { ...v, slotIds: [...v.slotIds], roomIds: [...v.roomIds] }
      ])
    ),
    unplaced: [...sol.unplaced],
    seed: sol.seed
  }
}
