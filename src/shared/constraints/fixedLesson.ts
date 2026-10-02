/**
 * 预排锁定（fixed_lesson）的冲突判定 —— **唯一实现**。
 *
 * 预排课是硬约束 H7：占位不可被侵占。录入时就必须挡住「同班同时段两个占位」
 * 「同一教师分身」「场地班位超并发容量」这些一眼可见的矛盾，
 * 否则会在 M3 排课阶段变成无解诊断，教务不知道错在哪。
 *
 * 两种语义（fixed_lesson.kind，migration 006）判定规则不同：
 *   lesson —— 预排一节课，必须绑班级或整年级，占「班级 + 教师 + 场地」三份资源
 *   block  —— 仅占用，不绑班级，至少占教师或教室之一；占场地时**独占**全部并发容量
 *             （维护、外借针对整个场地，不是某个班位）
 *
 * 禁止 import Electron / Node。
 */
import type { FixedLessonKind } from '../domain'

export interface FixedLessonLike {
  id?: number
  /** 省略按 'lesson' 处理，保持 migration 006 之前的行为 */
  kind?: FixedLessonKind
  /** lesson 时二选一：班级级占位 或 整年级占位；block 时两者都为 null */
  classId: number | null
  gradeId: number | null
  /** 归属学科，用于课时守恒（H4）核对；升旗/班会这类无学科占位为 null */
  subjectId?: number | null
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
  /**
   * `classId:subjectId` → 教学任务的周课时数，用于课时守恒（H4）。
   * 省略则跳过课时校验（旧调用方、单测里只关心占用冲突的场景）。
   * 没有对应教学任务的组合**不在此表内**，也就不会被判超额 ——
   * 讲座、代课这类课表外安排不该被拦住。
   */
  subjectQuota?: Map<string, number>
}

export type FixedConflictKind = 'class' | 'teacher' | 'room' | 'invalid' | 'quota'

export interface FixedLessonConflict {
  kind: FixedConflictKind
  slotId: number
  message: string
  /** 涉事记录在入参数组中的下标 */
  indexes: number[]
}

/** 未显式声明 kind 的旧数据一律按预排课处理 */
function kindOf(f: FixedLessonLike): FixedLessonKind {
  return f.kind ?? 'lesson'
}

/** 展开为实际被占用的班级集合：年级级占位 = 该年级所有班；block 不占班级 */
function expandClasses(f: FixedLessonLike, ctx: FixedLessonContext): number[] {
  if (kindOf(f) === 'block') return []
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

  // 0. 基本合法性：两种语义各自的最低要求
  lessons.forEach((f, i) => {
    if (kindOf(f) === 'block') {
      if (f.teacherId == null && f.classroomId == null) {
        conflicts.push({
          kind: 'invalid',
          slotId: f.slotId,
          message: '「仅占用」至少要指定一个被占用的对象：教师或教室',
          indexes: [i]
        })
      }
      if (f.classId != null || f.gradeId != null) {
        conflicts.push({
          kind: 'invalid',
          slotId: f.slotId,
          message: '「仅占用」不产生课，不能绑定班级或年级；要排课请改用「预排课」',
          indexes: [i]
        })
      }
      return
    }
    if (f.classId == null && f.gradeId == null) {
      conflicts.push({
        kind: 'invalid',
        slotId: f.slotId,
        message: '预排课必须指定「班级」或「整年级」之一',
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
      const hasBlock = idxs.some((i) => kindOf(lessons[i]) === 'block')
      conflicts.push({
        kind: 'teacher',
        slotId,
        message: hasBlock
          ? '该教师在这个时段已被标记为占用（开会/外出），不能再排预排课'
          : '同一教师在该时段被安排了多个预排占位',
        indexes: idxs
      })
    }
  }

  // 3. 场地并发容量（H3）：普通教室 concurrent_capacity=1 时退化为独占
  //    年级级占位按「占用的班数」计入班位消耗；
  //    block（维护/外借）针对整个场地，直接吃满容量，使该场地在此时段彻底不可用
  const roomSeen = new Map<string, { idxs: number[]; used: number; blocked: boolean }>()
  lessons.forEach((f, i) => {
    if (f.classroomId == null) return
    const key = `${f.classroomId}#${f.slotId}`
    const cap = ctx.roomConcurrency.get(f.classroomId) ?? 1
    const isBlock = kindOf(f) === 'block'
    const used = isBlock ? Math.max(1, cap) : Math.max(1, expandClasses(f, ctx).length)
    const cur = roomSeen.get(key)
    if (cur) {
      cur.idxs.push(i)
      cur.used += used
      cur.blocked = cur.blocked || isBlock
    } else {
      roomSeen.set(key, { idxs: [i], used, blocked: isBlock })
    }
  })
  for (const [key, v] of roomSeen) {
    const [roomStr, slotStr] = key.split('#')
    const cap = ctx.roomConcurrency.get(Number(roomStr)) ?? 1
    // 场地被标记占用后，同格再出现任何一条记录都是矛盾（哪怕容量够）
    if (v.blocked && v.idxs.length > 1) {
      conflicts.push({
        kind: 'room',
        slotId: Number(slotStr),
        message: '该场地在这个时段已被标记为占用（维护/外借），不能再安排使用',
        indexes: v.idxs
      })
      continue
    }
    if (v.used > cap) {
      conflicts.push({
        kind: 'room',
        slotId: Number(slotStr),
        message: `场地并发容量不足：该时段需 ${v.used} 个班位，仅有 ${cap} 个`,
        indexes: v.idxs
      })
    }
  }

  // 4. 课时守恒（H4）：一个班某学科的预排节数不能超过教学任务定的周课时数。
  //    预排是直接钉死在课表上的，超出部分在 M3 求解时无论如何都消化不掉 ——
  //    「一个班一周 1 节信息技术却预排了 5 节」必然无解，且报错点会离录入现场很远，
  //    所以在录入时就挡住。年级级占位按它实际覆盖的每个班分别计数。
  if (ctx.subjectQuota && ctx.subjectQuota.size > 0) {
    const quotaSeen = new Map<string, number[]>()
    lessons.forEach((f, i) => {
      if (kindOf(f) === 'block' || f.subjectId == null) return
      for (const c of expandClasses(f, ctx)) {
        const key = `${c}:${f.subjectId}`
        const arr = quotaSeen.get(key)
        if (arr) arr.push(i)
        else quotaSeen.set(key, [i])
      }
    })
    for (const [key, idxs] of quotaSeen) {
      const limit = ctx.subjectQuota.get(key)
      // 该班没有这门课的教学任务 → 不归课时守恒管（上面注释说明的理由）
      if (limit == null) continue
      if (idxs.length > limit) {
        conflicts.push({
          kind: 'quota',
          slotId: lessons[idxs[idxs.length - 1]].slotId,
          message:
            limit === 0
              ? '这门课的教学任务周课时为 0，不能预排'
              : `课时超额：预排了 ${idxs.length} 节，教学任务只有 ${limit} 节`,
          indexes: idxs
        })
      }
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
