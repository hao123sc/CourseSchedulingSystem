/**
 * 预排锁定（fixed_lesson）的冲突判定 —— **唯一实现**。
 *
 * 预排课是硬约束 H7：占位不可被侵占。录入时就必须挡住「同班同时段两个占位」
 * 「同一教师分身」「场地班位超并发容量」这些一眼可见的矛盾，
 * 否则会在 M3 排课阶段变成无解诊断，教务不知道错在哪。
 *
 * 禁止 import Electron / Node。
 */

export interface FixedLessonLike {
  id?: number
  /** 二选一：班级级占位 或 整年级占位 */
  classId: number | null
  gradeId: number | null
  teacherId: number | null
  classroomId: number | null
  slotId: number
  label?: string | null
}

/** 判定所需的外部信息（班级归属年级、场地并发容量） */
export interface FixedLessonContext {
  /** classId → gradeId */
  classGrade: Map<number, number>
  /** gradeId → 该年级全部班级 id */
  gradeClasses: Map<number, number[]>
  /** classroomId → concurrent_capacity */
  roomConcurrency: Map<number, number>
}

export type FixedConflictKind = 'class' | 'teacher' | 'room' | 'invalid'

export interface FixedLessonConflict {
  kind: FixedConflictKind
  slotId: number
  message: string
  /** 涉事记录在入参数组中的下标 */
  indexes: number[]
}

/** 展开为实际被占用的班级集合：年级级占位 = 该年级所有班 */
function expandClasses(f: FixedLessonLike, ctx: FixedLessonContext): number[] {
  if (f.classId != null) return [f.classId]
  if (f.gradeId != null) return ctx.gradeClasses.get(f.gradeId) ?? []
  return []
}

/**
 * 全量检查一组预排占位的互相冲突。
 * 返回空数组表示这组占位自洽，可以安全落库。
 */
export function detectFixedLessonConflicts(
  lessons: FixedLessonLike[],
  ctx: FixedLessonContext
): FixedLessonConflict[] {
  const conflicts: FixedLessonConflict[] = []

  // 0. 基本合法性：必须指定班级或年级之一
  lessons.forEach((f, i) => {
    if (f.classId == null && f.gradeId == null) {
      conflicts.push({
        kind: 'invalid',
        slotId: f.slotId,
        message: '预排占位必须指定「班级」或「整年级」之一',
        indexes: [i]
      })
    }
  })

  // 1. 班级占用唯一（H1）：同一班同一 slot 只能有一个占位
  const classSeen = new Map<string, number[]>()
  lessons.forEach((f, i) => {
    for (const c of expandClasses(f, ctx)) {
      const key = `${c}#${f.slotId}`
      const arr = classSeen.get(key)
      if (arr) arr.push(i)
      else classSeen.set(key, [i])
    }
  })
  for (const [key, idxs] of classSeen) {
    if (idxs.length > 1) {
      const slotId = Number(key.split('#')[1])
      conflicts.push({
        kind: 'class',
        slotId,
        message: '同一班级在该时段被安排了多个预排占位',
        indexes: idxs
      })
    }
  }

  // 2. 教师占用唯一（H2）
  const teacherSeen = new Map<string, number[]>()
  lessons.forEach((f, i) => {
    if (f.teacherId == null) return
    const key = `${f.teacherId}#${f.slotId}`
    const arr = teacherSeen.get(key)
    if (arr) arr.push(i)
    else teacherSeen.set(key, [i])
  })
  for (const [key, idxs] of teacherSeen) {
    if (idxs.length > 1) {
      const slotId = Number(key.split('#')[1])
      conflicts.push({
        kind: 'teacher',
        slotId,
        message: '同一教师在该时段被安排了多个预排占位',
        indexes: idxs
      })
    }
  }

  // 3. 场地并发容量（H3）：普通教室 concurrent_capacity=1 时退化为独占
  //    年级级占位按「占用的班数」计入班位消耗
  const roomSeen = new Map<string, { idxs: number[]; used: number }>()
  lessons.forEach((f, i) => {
    if (f.classroomId == null) return
    const key = `${f.classroomId}#${f.slotId}`
    const used = Math.max(1, expandClasses(f, ctx).length)
    const cur = roomSeen.get(key)
    if (cur) {
      cur.idxs.push(i)
      cur.used += used
    } else {
      roomSeen.set(key, { idxs: [i], used })
    }
  })
  for (const [key, v] of roomSeen) {
    const [roomStr, slotStr] = key.split('#')
    const cap = ctx.roomConcurrency.get(Number(roomStr)) ?? 1
    if (v.used > cap) {
      conflicts.push({
        kind: 'room',
        slotId: Number(slotStr),
        message: `场地并发容量不足：该时段需 ${v.used} 个班位，仅有 ${cap} 个`,
        indexes: v.idxs
      })
    }
  }

  return conflicts
}

/** 增量检查：把「待新增/待修改的一条」放进已有集合里试算，只回报与它相关的冲突 */
export function checkFixedLessonAgainst(
  candidate: FixedLessonLike,
  existing: FixedLessonLike[],
  ctx: FixedLessonContext
): FixedLessonConflict[] {
  const others = existing.filter((e) => candidate.id == null || e.id !== candidate.id)
  const all = [...others, candidate]
  const candidateIndex = all.length - 1
  return detectFixedLessonConflicts(all, ctx).filter((c) => c.indexes.includes(candidateIndex))
}
