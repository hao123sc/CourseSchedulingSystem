/**
 * 硬约束校验器：给定一个解，逐条核对 H1~H11（docs/04 §1.2），返回全部违反。
 *
 * 它是**独立于放置逻辑的第二实现**——Board 负责"不放错"，verify 负责"事后抓错"。
 * 两边同时写错同一个地方的概率远低于共用一份实现，M3 验收「硬约束违反 = 0」以本文件为准。
 *
 * H11（走班学生冲突）需要「虚拟班 → 行政班」的归属信息，当前 `SolverInput`
 * 还没有这块数据（走班属 M9 选做），因此通过可选入参 `studentGroups` 注入：
 * key = 班级 id，value = 该班学生所属的行政班/学生群体 id 列表。
 * 不传则该条恒为通过（没有走班数据就不存在走班冲突）。
 */
import type { SolverContext } from './context'
import type { HardViolation, Solution } from '../model/solution'
import { WeekBitmap, WeekCounter } from './occupancy'

export interface VerifyOptions {
  /** classId → 学生群体 id 列表（走班，H11） */
  studentGroups?: Map<number, number[]>
}

export function verifyHardConstraints(
  ctx: SolverContext,
  sol: Solution,
  opts: VerifyOptions = {}
): HardViolation[] {
  const out: HardViolation[] = []
  const S = ctx.slots.length
  const classById = new Map(ctx.input.classes.map((c) => [c.id, c]))
  const subjectById = new Map(ctx.input.subjects.map((s) => [s.id, s]))
  const slotName = (si: number): string => {
    const s = ctx.slots[si]
    return `周${s.dayOfWeek} 第${s.periodIndex}节`
  }

  // ── 预排占位先落盘（H7 的基准）────────────────────────────────────
  const classBits = new WeekBitmap(Math.max(1, ctx.input.classes.length), S)
  const teacherBits = new WeekBitmap(Math.max(1, ctx.input.teachers.length), S)
  const roomLoad = new WeekCounter(Math.max(1, ctx.input.rooms.length), S)
  const groupLoad = new WeekCounter(Math.max(1, ctx.groupCapacity.length), S)
  /** (资源, slot) → 已占用者描述，用于报错文案 */
  const classOwner = new Map<string, string>()
  const teacherOwner = new Map<string, string>()
  const fixedCells = new Set<string>()

  const gradeById = new Map(ctx.input.grades.map((g) => [g.id, g]))
  for (const f of ctx.input.fixedLessons) {
    const si = ctx.slotIdx.get(f.slotId)
    if (si == null) continue
    if (f.kind === 'block') {
      if (f.teacherId != null) {
        const ti = ctx.teacherIdx.get(f.teacherId)
        if (ti != null) {
          teacherBits.occupy(ti, si, 0b11)
          teacherOwner.set(`${ti}#${si}`, `预排占用「${f.label ?? '占位'}」`)
          fixedCells.add(`T${ti}#${si}`)
        }
      }
      if (f.classroomId != null) {
        const ri = ctx.roomIdx.get(f.classroomId)
        if (ri != null) {
          roomLoad.occupy(ri, si, 0b11, ctx.roomConcurrent[ri])
          fixedCells.add(`R${ri}#${si}`)
        }
      }
      continue
    }
    const targets = f.classId != null ? [f.classId] : (gradeById.get(f.gradeId ?? -1)?.classIds ?? [])
    for (const c of targets) {
      const ci = ctx.classIdx.get(c)
      if (ci == null) continue
      classBits.occupy(ci, si, 0b11)
      classOwner.set(`${ci}#${si}`, `预排课「${f.label ?? '占位'}」`)
      fixedCells.add(`C${ci}#${si}`)
    }
    if (f.teacherId != null) {
      const ti = ctx.teacherIdx.get(f.teacherId)
      if (ti != null) {
        teacherBits.occupy(ti, si, 0b11)
        teacherOwner.set(`${ti}#${si}`, `预排课「${f.label ?? '占位'}」`)
        fixedCells.add(`T${ti}#${si}`)
      }
    }
    if (f.classroomId != null) {
      const ri = ctx.roomIdx.get(f.classroomId)
      if (ri != null) {
        roomLoad.occupy(ri, si, 0b11, Math.max(1, targets.length))
        fixedCells.add(`R${ri}#${si}`)
      }
    }
  }

  // ── 逐个指派核对 ─────────────────────────────────────────────────
  for (const [unitId, a] of sol.assignments) {
    const u = ctx.units[unitId]
    if (!u) continue
    const slotIdxs = a.slotIds.map((id) => ctx.slotIdx.get(id))
    if (slotIdxs.some((x) => x == null)) {
      out.push({ code: 'H5', message: `单元 #${unitId} 落在不存在的时段上`, unitIds: [unitId] })
      continue
    }
    const sis = slotIdxs as number[]

    // H10 连堂完整：节数对得上、同日、同分段、节次相邻
    if (sis.length !== u.size) {
      out.push({
        code: 'H10',
        message: `连堂块 #${unitId} 应占 ${u.size} 节，实际 ${sis.length} 节`,
        unitIds: [unitId]
      })
    } else {
      const days = new Set(sis.map((si) => ctx.slots[si].dayOfWeek))
      const segs = new Set(sis.map((si) => ctx.slots[si].segment))
      const periods = sis.map((si) => ctx.slots[si].periodIndex).sort((x, y) => x - y)
      const adjacent = periods.every((p, i) => i === 0 || p === periods[i - 1] + 1)
      if (days.size > 1 || segs.size > 1 || !adjacent) {
        out.push({
          code: 'H10',
          message: `连堂块 #${unitId} 的 ${u.size} 节没有同日相邻（或跨了上下午分段）`,
          unitIds: [unitId],
          slotId: a.slotId
        })
      }
    }

    for (const si of sis) {
      // H5 禁排
      if (ctx.ruleValueOf(unitId, si) === 'FORBIDDEN') {
        out.push({
          code: 'H5',
          message: `${slotName(si)}对该课是禁排时段`,
          unitIds: [unitId],
          slotId: a.slotId
        })
      }
      // 非教学槽 / 跨学段
      const slot = ctx.slots[si]
      if (!slot.isTeaching || slot.stageId !== u.stageId) {
        out.push({
          code: 'H5',
          message: `${slotName(si)}不是该学段的教学时段`,
          unitIds: [unitId],
          slotId: a.slotId
        })
      }

      // H1 班级唯一 / H7 预排不可侵占
      for (const c of u.classIds) {
        const ci = ctx.classIdx.get(c)
        if (ci == null) continue
        if (classBits.conflicts(ci, si, u.weekMask)) {
          const fixed = fixedCells.has(`C${ci}#${si}`)
          out.push({
            code: fixed ? 'H7' : 'H1',
            message: `${classById.get(c)?.name ?? '班级' + c} 在${slotName(si)}已有${classOwner.get(`${ci}#${si}`) ?? '其他课'}`,
            unitIds: [unitId],
            slotId: a.slotId
          })
        }
        classBits.occupy(ci, si, u.weekMask)
        classOwner.set(`${ci}#${si}`, `「${subjectById.get(u.subjectId)?.name ?? u.subjectId}」`)
      }

      // H2 教师唯一
      for (const t of u.teacherIds) {
        const ti = ctx.teacherIdx.get(t)
        if (ti == null) continue
        if (teacherBits.conflicts(ti, si, u.weekMask)) {
          const fixed = fixedCells.has(`T${ti}#${si}`)
          out.push({
            code: fixed ? 'H7' : 'H2',
            message: `教师 #${t} 在${slotName(si)}被安排了两节课（${teacherOwner.get(`${ti}#${si}`) ?? ''}）`,
            unitIds: [unitId],
            slotId: a.slotId
          })
        }
        teacherBits.occupy(ti, si, u.weekMask)
        teacherOwner.set(`${ti}#${si}`, `「${subjectById.get(u.subjectId)?.name ?? u.subjectId}」`)
      }

      // H8 硬互斥组
      for (const gi of u.mutexGroupIds) {
        if (!groupLoad.fits(gi, si, u.weekMask, 1, ctx.groupCapacity[gi])) {
          out.push({
            code: 'H8',
            message: `${slotName(si)}违反硬互斥组（同时上课数超过 ${ctx.groupCapacity[gi]}）`,
            unitIds: [unitId],
            slotId: a.slotId
          })
        }
        groupLoad.occupy(gi, si, u.weekMask, 1)
      }

      // H3 场地并发 / H3b 人数容量 / H6 教室匹配
      if (a.roomId != null) {
        const ri = ctx.roomIdx.get(a.roomId)
        if (ri == null) {
          out.push({ code: 'H6', message: `单元 #${unitId} 落在不存在的场地上`, unitIds: [unitId] })
        } else {
          const opt = u.roomOptions.find((o) => o.roomId === a.roomId)
          const need = (opt ? opt.slotsTaken : 1) * Math.max(1, u.classIds.length)
          if (!roomLoad.fits(ri, si, u.weekMask, need, ctx.roomConcurrent[ri])) {
            const fixed = fixedCells.has(`R${ri}#${si}`)
            out.push({
              code: fixed ? 'H7' : 'H3',
              message: `场地 #${a.roomId} 在${slotName(si)}并发容量不足（上限 ${ctx.roomConcurrent[ri]} 个班位）`,
              unitIds: [unitId],
              slotId: a.slotId
            })
          }
          roomLoad.occupy(ri, si, u.weekMask, need)
          if (ctx.roomSeats[ri] < u.studentCount) {
            out.push({
              code: 'H3b',
              message: `场地 #${a.roomId} 座位 ${ctx.roomSeats[ri]} 个，坐不下 ${u.studentCount} 人`,
              unitIds: [unitId],
              slotId: a.slotId
            })
          }
        }
      }
      if (u.needRoom) {
        const allowed = u.roomOptions.map((o) => o.roomId)
        if (a.roomId == null || !allowed.includes(a.roomId)) {
          out.push({
            code: 'H6',
            message: `「${subjectById.get(u.subjectId)?.name ?? u.subjectId}」必须排在专用场地，当前场地不在允许清单内`,
            unitIds: [unitId],
            slotId: a.slotId
          })
        }
      }
    }
  }

  // ── H4 课时守恒：每条任务恰好排满 weeklyPeriods ────────────────────
  const placedByTask = new Map<number, number>()
  for (const [unitId, a] of sol.assignments) {
    const u = ctx.units[unitId]
    if (!u) continue
    // 复合单元（H9 拼合）里每条任务各得 size 节
    for (const tid of u.taskIds) {
      placedByTask.set(tid, (placedByTask.get(tid) ?? 0) + a.slotIds.length)
    }
  }
  const fixedByTask = new Map<number, number>()
  for (const t of ctx.input.tasks) {
    const used = ctx.fixedPlacements.filter(
      (f) => f.classId === t.classId && f.subjectId === t.subjectId
    ).length
    fixedByTask.set(t.id, used)
  }
  for (const t of ctx.input.tasks) {
    const total = (placedByTask.get(t.id) ?? 0) + (fixedByTask.get(t.id) ?? 0)
    if (total !== t.weeklyPeriods) {
      out.push({
        code: 'H4',
        message: `${classById.get(t.classId)?.name ?? '班级' + t.classId}「${subjectById.get(t.subjectId)?.name ?? t.subjectId}」应排 ${t.weeklyPeriods} 节，实排 ${total} 节`,
        unitIds: ctx.units.filter((u) => u.taskIds.includes(t.id)).map((u) => u.id)
      })
    }
  }

  // ── H9 同槽组：组内任务必须落在同一批时段 ───────────────────────────
  for (const g of ctx.input.constraintGroups) {
    if (g.hardness !== 'hard') continue
    if (g.groupType !== 'merge' && g.groupType !== 'simultaneous') continue
    const taskIds = g.members.filter((m) => m.memberType === 'task').map((m) => m.memberId)
    if (taskIds.length < 2) continue
    const slotSets = taskIds.map((tid) => {
      const set = new Set<number>()
      for (const [unitId, a] of sol.assignments) {
        if (ctx.units[unitId]?.taskIds.includes(tid)) for (const s of a.slotIds) set.add(s)
      }
      return set
    })
    const ref = slotSets[0]
    for (let i = 1; i < slotSets.length; i++) {
      const same =
        ref.size === slotSets[i].size && [...ref].every((s) => slotSets[i].has(s))
      if (!same) {
        out.push({
          code: 'H9',
          message: `约束组「${g.name}」要求组内任务同时上课，实际时段不一致`,
          unitIds: []
        })
        break
      }
    }
  }

  // ── H11 走班学生冲突：共享学生群体的班级不得同槽 ─────────────────────
  if (opts.studentGroups && opts.studentGroups.size > 0) {
    /** `群体#slot` → 已占用的 unitId */
    const seen = new Map<string, number>()
    for (const [unitId, a] of sol.assignments) {
      const u = ctx.units[unitId]
      if (!u) continue
      for (const c of u.classIds) {
        for (const gid of opts.studentGroups.get(c) ?? []) {
          for (const sid of a.slotIds) {
            const key = `${gid}#${sid}`
            const prev = seen.get(key)
            if (prev != null && prev !== unitId) {
              out.push({
                code: 'H11',
                message: `走班学生群体 #${gid} 在同一时段被安排了两节课`,
                unitIds: [prev, unitId],
                slotId: sid
              })
            } else {
              seen.set(key, unitId)
            }
          }
        }
      }
    }
  }

  return out
}
