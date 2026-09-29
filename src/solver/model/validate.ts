/**
 * `SolverInput` 完备性自检 —— 纯函数，零 IO。
 *
 * 定位：M2 验收「数据可完整读出为 SolverInput」的守门人，也是 M3 无解诊断的前置。
 * 只做**输入数据本身**的完备性/一致性检查（缺教师、课时超容量、禁排过多…），
 * 真正的排课可行性判定（二分图匹配、霍尔条件）留给 M3 的 preprocess/feasibility。
 */
import { indexRulesBySlot, mergeRuleValues, type ScopedRule } from '@shared/constraints'
import type { SolverInput } from './types'

export type IssueLevel = 'error' | 'warn' | 'info'

export interface SolverInputIssue {
  level: IssueLevel
  code: string
  message: string
  /** 便于 UI 点击定位 */
  ref?: { kind: 'class' | 'teacher' | 'subject' | 'task' | 'room' | 'slot'; id: number }
}

export interface SolverInputReport {
  ok: boolean
  /** 关键规模指标，UI 上直接展示 */
  stats: {
    classes: number
    teachers: number
    subjects: number
    rooms: number
    tasks: number
    /** 待排课时总数（含连堂展开前的总节数） */
    totalPeriods: number
    timeRules: number
    fixedLessons: number
    constraintGroups: number
    /** 未指派教师的任务数 */
    unassignedTasks: number
  }
  issues: SolverInputIssue[]
}

export function validateSolverInput(input: SolverInput): SolverInputReport {
  const issues: SolverInputIssue[] = []

  const classById = new Map(input.classes.map((c) => [c.id, c]))
  const teacherById = new Map(input.teachers.map((t) => [t.id, t]))
  const subjectById = new Map(input.subjects.map((s) => [s.id, s]))
  const stageById = new Map(input.stages.map((s) => [s.id, s]))
  const slotById = new Map(input.slots.map((s) => [s.id, s]))

  const totalPeriods = input.tasks.reduce((s, t) => s + t.weeklyPeriods, 0)
  const unassignedTasks = input.tasks.filter((t) => t.teacherId == null).length

  // ── 1. 基础数据是否齐备 ───────────────────────────────────────────────
  if (input.classes.length === 0) {
    issues.push({ level: 'error', code: 'NO_CLASS', message: '当前学期没有任何班级' })
  }
  if (input.tasks.length === 0) {
    issues.push({ level: 'error', code: 'NO_TASK', message: '当前学期没有任何教学任务' })
  }
  if (input.slots.filter((s) => s.isTeaching).length === 0) {
    issues.push({ level: 'error', code: 'NO_SLOT', message: '没有任何可排课的教学时段' })
  }

  // ── 2. 任务完整性 ────────────────────────────────────────────────────
  for (const t of input.tasks) {
    if (t.weeklyPeriods <= 0) {
      issues.push({
        level: 'error',
        code: 'TASK_ZERO',
        message: `任务 #${t.id} 周课时为 ${t.weeklyPeriods}，应大于 0`,
        ref: { kind: 'task', id: t.id }
      })
    }
    if (t.teacherId == null) {
      const c = classById.get(t.classId)
      const s = subjectById.get(t.subjectId)
      issues.push({
        level: 'error',
        code: 'TASK_NO_TEACHER',
        message: `${c?.name ?? '班级' + t.classId} 的${s?.name ?? '学科' + t.subjectId}未指派教师`,
        ref: { kind: 'task', id: t.id }
      })
    } else {
      const teacher = teacherById.get(t.teacherId)
      if (!teacher) {
        issues.push({
          level: 'error',
          code: 'TASK_TEACHER_MISSING',
          message: `任务 #${t.id} 指派的教师不存在或已停用`,
          ref: { kind: 'task', id: t.id }
        })
      } else if (teacher.subjectIds.length > 0 && !teacher.subjectIds.includes(t.subjectId)) {
        const s = subjectById.get(t.subjectId)
        issues.push({
          level: 'warn',
          code: 'TASK_TEACHER_SUBJECT',
          message: `${teacher.name} 未登记任教「${s?.name ?? t.subjectId}」，仍被指派了该科任务`,
          ref: { kind: 'teacher', id: teacher.id }
        })
      }
    }
    const blockPeriods = t.consecutiveCount * t.consecutiveSize
    if (blockPeriods > t.weeklyPeriods) {
      issues.push({
        level: 'error',
        code: 'TASK_CONSECUTIVE',
        message: `任务 #${t.id} 连堂需求 ${t.consecutiveCount}×${t.consecutiveSize}=${blockPeriods} 节，超过周课时 ${t.weeklyPeriods} 节`,
        ref: { kind: 'task', id: t.id }
      })
    }
  }

  // ── 3. 班级周课时是否超出该学段可用时段 ───────────────────────────────
  const perClass = new Map<number, number>()
  for (const t of input.tasks) {
    perClass.set(t.classId, (perClass.get(t.classId) ?? 0) + t.weeklyPeriods)
  }
  const fixedByClass = new Map<number, number>()
  for (const f of input.fixedLessons) {
    const targets =
      f.classId != null
        ? [f.classId]
        : (input.grades.find((g) => g.id === f.gradeId)?.classIds ?? [])
    for (const c of targets) fixedByClass.set(c, (fixedByClass.get(c) ?? 0) + 1)
  }
  for (const c of input.classes) {
    const stage = stageById.get(c.stageId)
    const capacity = stage?.slotIds.length ?? 0
    const demand = (perClass.get(c.id) ?? 0) + (fixedByClass.get(c.id) ?? 0)
    if (capacity > 0 && demand > capacity) {
      issues.push({
        level: 'error',
        code: 'CLASS_OVERLOAD',
        message: `${c.name} 周课时需求 ${demand} 节（含预排占位），超出学段可排时段 ${capacity} 节`,
        ref: { kind: 'class', id: c.id }
      })
    } else if (perClass.get(c.id) == null) {
      issues.push({
        level: 'warn',
        code: 'CLASS_NO_TASK',
        message: `${c.name} 尚未配置任何教学任务`,
        ref: { kind: 'class', id: c.id }
      })
    }
  }

  // ── 4. 教师工作量 ────────────────────────────────────────────────────
  const perTeacher = new Map<number, number>()
  for (const t of input.tasks) {
    if (t.teacherId == null) continue
    perTeacher.set(t.teacherId, (perTeacher.get(t.teacherId) ?? 0) + t.weeklyPeriods)
  }
  for (const [tid, periods] of perTeacher) {
    const teacher = teacherById.get(tid)
    if (!teacher) continue
    if (periods > teacher.maxWeeklyPeriods) {
      issues.push({
        level: 'error',
        code: 'TEACHER_OVERLOAD',
        message: `${teacher.name} 周课时 ${periods} 节，超过上限 ${teacher.maxWeeklyPeriods} 节`,
        ref: { kind: 'teacher', id: tid }
      })
    }
    // 教师在任一学段的可用时段都排不下
    const maxSlots = Math.max(0, ...input.stages.map((s) => s.slotIds.length))
    if (maxSlots > 0 && periods > maxSlots) {
      issues.push({
        level: 'error',
        code: 'TEACHER_SLOT_OVERLOAD',
        message: `${teacher.name} 周课时 ${periods} 节，超过一周可用时段总数 ${maxSlots} 节`,
        ref: { kind: 'teacher', id: tid }
      })
    }
  }

  // ── 5. 禁排是否把某个作用域堵死（规则矛盾自检的轻量版） ─────────────────
  const rules: ScopedRule[] = input.timeRules.map((r) => ({
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    slotId: r.slotId,
    ruleValue: r.ruleValue
  }))
  const bySlot = indexRulesBySlot(rules)

  for (const c of input.classes) {
    const need = perClass.get(c.id) ?? 0
    if (need === 0) continue
    const stage = stageById.get(c.stageId)
    if (!stage) continue
    let usable = 0
    for (const slotId of stage.slotIds) {
      const hits = (bySlot.get(slotId) ?? []).filter(
        (r) =>
          r.scopeType === 'global' ||
          (r.scopeType === 'class' && r.scopeId === c.id) ||
          (r.scopeType === 'grade' && r.scopeId === c.gradeId)
      )
      if (mergeRuleValues(hits) !== 'FORBIDDEN') usable += 1
    }
    if (usable < need) {
      issues.push({
        level: 'error',
        code: 'CLASS_FORBIDDEN_TOO_MANY',
        message: `${c.name} 扣除禁排后仅剩 ${usable} 个可用时段，不足以安排 ${need} 节课`,
        ref: { kind: 'class', id: c.id }
      })
    }
  }

  for (const [tid, periods] of perTeacher) {
    const teacher = teacherById.get(tid)
    if (!teacher) continue
    const allTeaching = input.slots.filter((s) => s.isTeaching)
    let usable = 0
    for (const s of allTeaching) {
      const hits = (bySlot.get(s.id) ?? []).filter(
        (r) => r.scopeType === 'global' || (r.scopeType === 'teacher' && r.scopeId === teacher.id)
      )
      if (mergeRuleValues(hits) !== 'FORBIDDEN') usable += 1
    }
    if (usable < periods) {
      issues.push({
        level: 'error',
        code: 'TEACHER_FORBIDDEN_TOO_MANY',
        message: `${teacher.name} 扣除禁排后仅剩 ${usable} 个可用时段，不足以安排 ${periods} 节课`,
        ref: { kind: 'teacher', id: tid }
      })
    }
  }

  // ── 6. 预排占位引用的时段是否存在 ─────────────────────────────────────
  for (const f of input.fixedLessons) {
    if (!slotById.has(f.slotId)) {
      issues.push({
        level: 'error',
        code: 'FIXED_SLOT_MISSING',
        message: `预排占位「${f.label ?? f.id}」引用了不存在的时段`,
        ref: { kind: 'slot', id: f.slotId }
      })
    }
  }

  // ── 6b. 预排占位是否吃超了教学任务的课时（H4 课时守恒）────────────────
  //      预排是钉死的，超出的部分无论怎么排都消化不掉，属于开排前必须清掉的死结。
  {
    const quota = new Map<string, number>()
    for (const t of input.tasks) {
      const k = `${t.classId}:${t.subjectId}`
      quota.set(k, (quota.get(k) ?? 0) + t.weeklyPeriods)
    }
    const fixedUsed = new Map<string, number>()
    for (const f of input.fixedLessons) {
      if (f.kind === 'block' || f.subjectId == null) continue
      const targets =
        f.classId != null
          ? [f.classId]
          : f.gradeId != null
            ? input.classes.filter((c) => c.gradeId === f.gradeId).map((c) => c.id)
            : []
      for (const c of targets) {
        const k = `${c}:${f.subjectId}`
        fixedUsed.set(k, (fixedUsed.get(k) ?? 0) + 1)
      }
    }
    for (const [k, used] of fixedUsed) {
      const limit = quota.get(k)
      // 没有教学任务的组合不归课时守恒管（讲座、代课这类课表外安排）
      if (limit == null || used <= limit) continue
      const [classIdStr, subjectIdStr] = k.split(':')
      const classId = Number(classIdStr)
      const subjectName = subjectById.get(Number(subjectIdStr))?.name ?? '该学科'
      issues.push({
        level: 'error',
        code: 'FIXED_OVER_QUOTA',
        message:
          `${classById.get(classId)?.name ?? '某班'}「${subjectName}」预排了 ${used} 节，` +
          `教学任务只有 ${limit} 节 —— 删掉多余的预排，或把周课时改大`,
        ref: { kind: 'class', id: classId }
      })
    }
  }

  // ── 7. 需专用教室的学科是否绑定了场地 ─────────────────────────────────
  const usedSubjects = new Set(input.tasks.map((t) => t.subjectId))
  for (const s of input.subjects) {
    if (!usedSubjects.has(s.id)) continue
    if (s.needSpecialRoom && s.allowedRooms.length === 0) {
      issues.push({
        level: 'error',
        code: 'SUBJECT_NO_ROOM',
        message: `「${s.name}」标记为需要专用教室，但未绑定任何可用场地`,
        ref: { kind: 'subject', id: s.id }
      })
    }
  }

  // ── 8. 约束组成员是否有效 ────────────────────────────────────────────
  const taskIds = new Set(input.tasks.map((t) => t.id))
  for (const g of input.constraintGroups) {
    if (g.members.length < 2) {
      issues.push({
        level: 'warn',
        code: 'GROUP_TOO_SMALL',
        message: `约束组「${g.name}」成员少于 2 个，不产生任何约束`
      })
    }
    for (const m of g.members) {
      const exists =
        (m.memberType === 'teacher' && teacherById.has(m.memberId)) ||
        (m.memberType === 'subject' && subjectById.has(m.memberId)) ||
        (m.memberType === 'class' && classById.has(m.memberId)) ||
        (m.memberType === 'task' && taskIds.has(m.memberId))
      if (!exists) {
        issues.push({
          level: 'warn',
          code: 'GROUP_MEMBER_MISSING',
          message: `约束组「${g.name}」包含已失效的成员（${m.memberType} #${m.memberId}）`
        })
      }
    }
  }

  return {
    ok: issues.every((i) => i.level !== 'error'),
    stats: {
      classes: input.classes.length,
      teachers: input.teachers.length,
      subjects: input.subjects.length,
      rooms: input.rooms.length,
      tasks: input.tasks.length,
      totalPeriods,
      timeRules: input.timeRules.length,
      fixedLessons: input.fixedLessons.length,
      constraintGroups: input.constraintGroups.length,
      unassignedTasks
    },
    issues
  }
}
