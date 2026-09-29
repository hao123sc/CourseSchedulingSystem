/**
 * 建模：把 `SolverInput`（数据库快照）编译成引擎内部的稠密结构 `SolverContext`。
 *
 * 做四件事：
 *   1. 实体 id → 稠密下标，时段 → 稠密 slotIdx（位图/计数器只认下标）
 *   2. 把连堂窗口（同日相邻、不跨上下午分段，H10）预先枚举好，
 *      放置时只需选「窗口 id」，天然满足 H10
 *   3. 预排占位落位：kind='lesson' 占班级+教师+场地三份资源并**扣减待排节数**（H4）；
 *      kind='block' 不产生课，只摘资源，占场地时独占全部并发容量（H7）
 *   4. 拆课时单元 + 初始值域（H5 禁排、H6 教室匹配、H3b 人数容量、学段/教学槽过滤）
 *
 * 纯 TS，零 IO；冲突判定复用 `@shared/constraints`，不另写一套。
 */
import { indexRulesBySlot, mergeRuleValues, type ScopedRule } from '@shared/constraints'
import type { RuleValue, WeekMode } from '@shared/domain'
import type { SolverInput, SolverSlot } from '../model/types'
import { WEEK_MASK, type Unit, type UnitRoomOption } from '../model/solution'
import { Occupancy } from './occupancy'

export interface SolverContext {
  input: SolverInput

  /** 稠密下标 ↔ id */
  slots: SolverSlot[]
  slotIdx: Map<number, number>
  classIdx: Map<number, number>
  teacherIdx: Map<number, number>
  roomIdx: Map<number, number>
  /** 硬互斥组（H8）的稠密下标 */
  groupIdx: Map<number, number>
  groupCapacity: number[]

  /** 场地并发容量 / 座位数，按 roomIdx 排列 */
  roomConcurrent: Uint16Array
  roomSeats: Int32Array

  /**
   * 连堂窗口：windows[i] = 连续占用的 slotIdx 数组（单节窗口长度为 1）。
   * 同日、相邻节次、同一分段（上午/下午/晚上），天然满足 H10。
   */
  windows: number[][]
  /** `stageId:size` → 窗口 id 列表 */
  windowsByStageSize: Map<string, number[]>

  units: Unit[]
  /** unitId → 可用窗口 id 列表（AC-3 之前的初始值域） */
  domains: number[][]

  /** 预排占位落位后的基线占用（H7：这些资源开排前就没了） */
  base: Occupancy

  /** 已被预排钉死的课（诊断与落库时要一起算进课时守恒） */
  fixedPlacements: {
    classId: number
    subjectId: number | null
    teacherId: number | null
    classroomId: number | null
    slotId: number
  }[]

  /** (unitId, windowId) → 有效规则值，M5 软约束要用；这里只用来判 FORBIDDEN */
  ruleValueOf(unitId: number, slotIdx: number): RuleValue
}

const HARD_MUTEX_TYPES = new Set(['teacher_mutex', 'subject_mutex'])
const SAME_SLOT_TYPES = new Set(['merge', 'simultaneous'])

function weekMaskOf(mode: WeekMode): number {
  return WEEK_MASK[mode] ?? 0b11
}

export function buildContext(input: SolverInput): SolverContext {
  // ── 1. 稠密下标 ──────────────────────────────────────────────────────
  const slots = [...input.slots].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  const slotIdx = new Map(slots.map((s, i) => [s.id, i]))
  const classIdx = new Map(input.classes.map((c, i) => [c.id, i]))
  const teacherIdx = new Map(input.teachers.map((t, i) => [t.id, i]))
  const roomIdx = new Map(input.rooms.map((r, i) => [r.id, i]))

  const roomConcurrent = new Uint16Array(Math.max(1, input.rooms.length))
  const roomSeats = new Int32Array(Math.max(1, input.rooms.length))
  input.rooms.forEach((r, i) => {
    roomConcurrent[i] = Math.max(1, r.concurrentCapacity || 1)
    roomSeats[i] = r.capacity > 0 ? r.capacity : Number.MAX_SAFE_INTEGER
  })

  const classById = new Map(input.classes.map((c) => [c.id, c]))
  const subjectById = new Map(input.subjects.map((s) => [s.id, s]))
  const gradeById = new Map(input.grades.map((g) => [g.id, g]))

  // ── 2. 连堂窗口枚举（H10）──────────────────────────────────────────
  const windows: number[][] = []
  const windowsByStageSize = new Map<string, number[]>()
  const maxSize = Math.max(1, ...input.tasks.map((t) => t.consecutiveSize || 1))
  for (const stage of input.stages) {
    // 该学段的教学槽，按 (day, sortOrder) 排；非教学槽（课间操/午休）直接排除
    const stageSlots = slots.filter((s) => s.stageId === stage.id && s.isTeaching)
    const byDaySegment = new Map<string, SolverSlot[]>()
    for (const s of stageSlots) {
      const k = `${s.dayOfWeek}#${s.segment}`
      const arr = byDaySegment.get(k)
      if (arr) arr.push(s)
      else byDaySegment.set(k, [s])
    }
    for (let size = 1; size <= maxSize; size++) {
      const ids: number[] = []
      for (const group of byDaySegment.values()) {
        const ordered = [...group].sort((a, b) => a.periodIndex - b.periodIndex)
        for (let i = 0; i + size <= ordered.length; i++) {
          // 相邻性：periodIndex 必须逐节递增，中间夹了非教学槽就不算相邻
          let contiguous = true
          for (let k = 1; k < size; k++) {
            if (ordered[i + k].periodIndex !== ordered[i + k - 1].periodIndex + 1) contiguous = false
          }
          if (!contiguous) continue
          windows.push(ordered.slice(i, i + size).map((s) => slotIdx.get(s.id)!))
          ids.push(windows.length - 1)
        }
      }
      windowsByStageSize.set(`${stage.id}:${size}`, ids)
    }
  }

  // ── 3. 规则索引（H5 / M5 软约束共用一份合并逻辑）────────────────────
  const rules: ScopedRule[] = input.timeRules.map((r) => ({
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    slotId: r.slotId,
    ruleValue: r.ruleValue
  }))
  const rulesBySlot = indexRulesBySlot(rules)

  // ── 4. 预排占位：基线占用 + 待排节数扣减（H7 / H4）──────────────────
  const base = new Occupancy({
    classes: input.classes.length,
    teachers: input.teachers.length,
    rooms: input.rooms.length,
    groups: input.constraintGroups.length,
    slots: slots.length
  })
  const fixedPlacements: SolverContext['fixedPlacements'] = []
  /** `classId:subjectId` → 已被预排钉死的节数 */
  const fixedUsed = new Map<string, number>()

  for (const f of input.fixedLessons) {
    const si = slotIdx.get(f.slotId)
    if (si == null) continue
    const mask = 0b11 // 预排占位不区分单双周，一律整周占死
    if (f.kind === 'block') {
      // 仅占用：不绑班级、不产生课；占场地时独占全部并发容量
      if (f.teacherId != null) {
        const ti = teacherIdx.get(f.teacherId)
        if (ti != null) base.teachers.occupy(ti, si, mask)
      }
      if (f.classroomId != null) {
        const ri = roomIdx.get(f.classroomId)
        if (ri != null) base.rooms.occupy(ri, si, mask, roomConcurrent[ri])
      }
      continue
    }
    // kind = 'lesson'：占班级 + 教师 + 场地，并计入该班该科的周课时
    const targets =
      f.classId != null ? [f.classId] : (gradeById.get(f.gradeId ?? -1)?.classIds ?? [])
    for (const c of targets) {
      const ci = classIdx.get(c)
      if (ci != null) base.classes.occupy(ci, si, mask)
      if (f.subjectId != null) {
        const k = `${c}:${f.subjectId}`
        fixedUsed.set(k, (fixedUsed.get(k) ?? 0) + 1)
      }
      fixedPlacements.push({
        classId: c,
        subjectId: f.subjectId,
        teacherId: f.teacherId,
        classroomId: f.classroomId,
        slotId: f.slotId
      })
    }
    if (f.teacherId != null) {
      const ti = teacherIdx.get(f.teacherId)
      if (ti != null) base.teachers.occupy(ti, si, mask)
    }
    if (f.classroomId != null) {
      const ri = roomIdx.get(f.classroomId)
      if (ri != null) base.rooms.occupy(ri, si, mask, Math.max(1, targets.length))
    }
  }

  // ── 5. 硬互斥组（H8）与同槽组（H9）────────────────────────────────
  const groupIdx = new Map<number, number>()
  const groupCapacity: number[] = []
  const mutexTeachers = new Map<number, number[]>() // teacherId → 组下标
  const mutexSubjects = new Map<number, number[]>()
  const sameSlotTaskGroups: { groupId: number; taskIds: number[] }[] = []

  for (const g of input.constraintGroups) {
    if (g.hardness !== 'hard') continue
    if (HARD_MUTEX_TYPES.has(g.groupType)) {
      const gi = groupCapacity.length
      groupIdx.set(g.id, gi)
      groupCapacity.push(Math.max(1, g.maxConcurrent ?? 1))
      for (const m of g.members) {
        if (g.groupType === 'teacher_mutex' && m.memberType === 'teacher') {
          const arr = mutexTeachers.get(m.memberId) ?? []
          arr.push(gi)
          mutexTeachers.set(m.memberId, arr)
        }
        if (g.groupType === 'subject_mutex' && m.memberType === 'subject') {
          const arr = mutexSubjects.get(m.memberId) ?? []
          arr.push(gi)
          mutexSubjects.set(m.memberId, arr)
        }
      }
    } else if (SAME_SLOT_TYPES.has(g.groupType)) {
      const taskIds = g.members.filter((m) => m.memberType === 'task').map((m) => m.memberId)
      if (taskIds.length >= 2) sameSlotTaskGroups.push({ groupId: g.id, taskIds })
    }
  }

  // ── 6. 拆课时单元 ──────────────────────────────────────────────────
  interface Draft {
    taskId: number
    classId: number
    subjectId: number
    teacherId: number | null
    stageId: number
    gradeId: number
    weekMode: WeekMode
    size: number
    fixedRoomId: number | null
  }

  const draftsByTask = new Map<number, Draft[]>()
  for (const t of input.tasks) {
    const cls = classById.get(t.classId)
    if (!cls) continue
    const used = fixedUsed.get(`${t.classId}:${t.subjectId}`) ?? 0
    // 录入端已挡住「预排超过周课时」，这里仍做兜底 clamp，绝不产生负数单元
    let remaining = Math.max(0, t.weeklyPeriods - used)
    const drafts: Draft[] = []
    const mk = (size: number): Draft => ({
      taskId: t.id,
      classId: t.classId,
      subjectId: t.subjectId,
      teacherId: t.teacherId,
      stageId: cls.stageId,
      gradeId: cls.gradeId,
      weekMode: t.weekMode,
      size,
      fixedRoomId: t.fixedRoomId
    })
    const blockSize = Math.max(1, t.consecutiveSize || 1)
    let blocks = blockSize > 1 ? Math.max(0, t.consecutiveCount || 0) : 0
    while (blocks > 0 && remaining >= blockSize) {
      drafts.push(mk(blockSize))
      remaining -= blockSize
      blocks -= 1
    }
    while (remaining > 0) {
      drafts.push(mk(1))
      remaining -= 1
    }
    draftsByTask.set(t.id, drafts)
  }

  // 同槽组（H9）：组内任务的第 i 个单元合并成一个复合单元，必然同槽
  const mergedInto = new Map<number, number>() // taskId → 组序号
  const mergeOrder: { groupId: number; taskIds: number[] }[] = []
  for (const g of sameSlotTaskGroups) {
    const usable = g.taskIds.filter((id) => draftsByTask.has(id) && !mergedInto.has(id))
    if (usable.length < 2) continue
    const gi = mergeOrder.length
    mergeOrder.push({ groupId: g.groupId, taskIds: usable })
    for (const id of usable) mergedInto.set(id, gi)
  }

  const units: Unit[] = []
  const pushUnit = (u: Omit<Unit, 'id'>): Unit => {
    const unit: Unit = { ...u, id: units.length }
    units.push(unit)
    return unit
  }

  const roomOptionsFor = (subjectId: number, needRoom: boolean): UnitRoomOption[] => {
    const s = subjectById.get(subjectId)
    if (!s || !needRoom) return []
    return s.allowedRooms.map((r) => ({
      roomId: r.classroomId,
      slotsTaken: Math.max(1, r.slotsTaken || 1),
      priority: r.priority
    }))
  }

  const makeUnit = (drafts: Draft[], mergeGroupId: number | null): void => {
    const first = drafts[0]
    const subject = subjectById.get(first.subjectId)
    const needRoom = subject?.needSpecialRoom ?? false
    const classIds = [...new Set(drafts.map((d) => d.classId))]
    const teacherIds = [...new Set(drafts.map((d) => d.teacherId).filter((x): x is number => x != null))]
    const gradeIds = [...new Set(drafts.map((d) => d.gradeId))]
    const mutexGroupIds = new Set<number>()
    for (const tid of teacherIds) for (const gi of mutexTeachers.get(tid) ?? []) mutexGroupIds.add(gi)
    for (const gi of mutexSubjects.get(first.subjectId) ?? []) mutexGroupIds.add(gi)

    // 任务上指定了固定教室 → 该场地即唯一候选（H6 的"任务级"指定优先于学科级）
    let roomOptions = roomOptionsFor(first.subjectId, needRoom)
    const fixedRoom = drafts.find((d) => d.fixedRoomId != null)?.fixedRoomId ?? null
    if (fixedRoom != null) {
      const hit = roomOptions.find((r) => r.roomId === fixedRoom)
      roomOptions = [hit ?? { roomId: fixedRoom, slotsTaken: 1, priority: 0 }]
    }

    // 固定教室指向一间不存在/已停用的教室时按"没有固定教室"处理，
    // 否则这个班的每节课都会因为找不到场地而排不出来
    const rawHome = classIds.length === 1 ? (classById.get(classIds[0])?.homeRoomId ?? null) : null
    const homeRoomId = rawHome != null && roomIdx.has(rawHome) ? rawHome : null
    const studentCount = classIds.reduce((s, c) => s + (classById.get(c)?.studentCount ?? 0), 0)

    pushUnit({
      taskIds: [...new Set(drafts.map((d) => d.taskId))],
      classIds,
      teacherIds,
      gradeIds,
      stageId: first.stageId,
      subjectId: first.subjectId,
      size: first.size,
      weekMode: first.weekMode,
      weekMask: weekMaskOf(first.weekMode),
      needRoom,
      roomOptions,
      homeRoomId,
      studentCount,
      importance: subject?.importance ?? 3,
      mergeGroupId,
      mutexGroupIds: [...mutexGroupIds],
      order: 0
    })
  }

  const handledTasks = new Set<number>()
  for (const g of mergeOrder) {
    const lists = g.taskIds.map((id) => draftsByTask.get(id) ?? [])
    const n = Math.min(...lists.map((l) => l.length))
    for (let i = 0; i < n; i++) makeUnit(lists.map((l) => l[i]), g.groupId)
    // 长短不齐时，多出来的单元按普通单元单独排（不强制同槽）
    for (let k = 0; k < lists.length; k++) {
      for (let i = n; i < lists[k].length; i++) makeUnit([lists[k][i]], null)
      handledTasks.add(g.taskIds[k])
    }
  }
  for (const [taskId, drafts] of draftsByTask) {
    if (handledTasks.has(taskId)) continue
    for (const d of drafts) makeUnit([d], null)
  }

  // ── 7. 排入顺序（docs/04 §4.1）────────────────────────────────────
  for (const u of units) {
    u.order =
      u.size > 1
        ? 1 // 连堂块自由度最低
        : u.mergeGroupId != null
          ? 2 // 拼合 / 同时上课
          : u.needRoom
            ? 3 // 需专用教室，资源稀缺
            : u.importance >= 4
              ? 4 // 主课
              : 5
  }

  // ── 8. 初始值域（H5 禁排 / 学段 / 教学槽 / H3b 人数 / H6 教室）──────
  const ruleCache = new Map<string, RuleValue>()
  const ruleValueOf = (unitId: number, si: number): RuleValue => {
    const key = `${unitId}#${si}`
    const hit = ruleCache.get(key)
    if (hit) return hit
    const u = units[unitId]
    const slot = slots[si]
    const bucket = rulesBySlot.get(slot.id) ?? []
    const hits = bucket.filter(
      (r) =>
        r.scopeType === 'global' ||
        (r.scopeType === 'class' && r.scopeId != null && u.classIds.includes(r.scopeId)) ||
        (r.scopeType === 'grade' && r.scopeId != null && u.gradeIds.includes(r.scopeId)) ||
        (r.scopeType === 'teacher' && r.scopeId != null && u.teacherIds.includes(r.scopeId)) ||
        (r.scopeType === 'subject' && r.scopeId === u.subjectId)
    )
    const v = mergeRuleValues(hits)
    ruleCache.set(key, v)
    return v
  }

  const domains: number[][] = units.map((u) => {
    const candidates = windowsByStageSize.get(`${u.stageId}:${u.size}`) ?? []
    const usableRooms = u.roomOptions.filter((o) => {
      const ri = roomIdx.get(o.roomId)
      // H3b 人数容量：座位数不足的场地直接从候选里剔除
      return ri != null && roomSeats[ri] >= u.studentCount
    })
    // 需专用教室却一个都容得下不了 → 留空值域，交给 AC-3/诊断报「不可行」
    if (u.needRoom) u.roomOptions = usableRooms
    return candidates.filter((wid) => windows[wid].every((si) => ruleValueOf(u.id, si) !== 'FORBIDDEN'))
  })

  return {
    input,
    slots,
    slotIdx,
    classIdx,
    teacherIdx,
    roomIdx,
    groupIdx,
    groupCapacity,
    roomConcurrent,
    roomSeats,
    windows,
    windowsByStageSize,
    units,
    domains,
    base,
    fixedPlacements,
    ruleValueOf
  }
}
