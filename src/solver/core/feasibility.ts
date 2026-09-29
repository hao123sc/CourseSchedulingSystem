/**
 * 阶段 0.3：资源充分性校验 + 逐资源二分图匹配可行性判定 + 无解诊断（docs/04 §3.3）。
 *
 * 三层，由粗到细，越往后越慢也越准：
 *   一、值域空检测      —— 某个单元一个落点都没有，直接点名是被谁堵死的
 *   二、资源总量校验    —— 班级 / 教师 / 场地 / 需专用场地的学科，供给 vs 需求
 *   三、霍尔条件（精确）—— 对每个班级、每位教师跑 Hopcroft-Karp 最大匹配，
 *                          匹配不满时提取**违反霍尔条件的最小紧缩集**，
 *                          告诉教务「这 5 个单元只有 3 个可用时段」
 *
 * 匹配只纳入 `size=1 且 weekMode='all'` 的单元：块单元占多格、单双周可共享一格，
 * 把它们塞进 1-1 匹配会产生**假报无解**。少算一部分需求只会让判定更宽松，
 * 因此本判定是**必要条件检验**（报无解一定真无解），不会冤枉任何一份可行数据。
 */
import type { SolverContext } from './context'
import type { Diagnosis } from './diagnosis'

/** Hopcroft-Karp：左 = 单元下标，右 = 时段下标 */
function hopcroftKarp(leftCount: number, adj: number[][], rightCount: number): number[] {
  const INF = Number.MAX_SAFE_INTEGER
  const matchL = new Array<number>(leftCount).fill(-1)
  const matchR = new Array<number>(rightCount).fill(-1)
  const dist = new Array<number>(leftCount).fill(0)

  const bfs = (): boolean => {
    const queue: number[] = []
    for (let u = 0; u < leftCount; u++) {
      if (matchL[u] === -1) {
        dist[u] = 0
        queue.push(u)
      } else dist[u] = INF
    }
    let found = false
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi]
      for (const v of adj[u]) {
        const w = matchR[v]
        if (w === -1) found = true
        else if (dist[w] === INF) {
          dist[w] = dist[u] + 1
          queue.push(w)
        }
      }
    }
    return found
  }

  const dfs = (u: number): boolean => {
    for (const v of adj[u]) {
      const w = matchR[v]
      if (w === -1 || (dist[w] === dist[u] + 1 && dfs(w))) {
        matchL[u] = v
        matchR[v] = u
        return true
      }
    }
    dist[u] = INF
    return false
  }

  while (bfs()) {
    for (let u = 0; u < leftCount; u++) if (matchL[u] === -1) dfs(u)
  }
  return matchL
}

/** 从未匹配点出发做交替 BFS，取出违反霍尔条件的紧缩集（左点集合 + 它们的邻域） */
function hallTightSet(
  adj: number[][],
  matchL: number[]
): { left: number[]; right: number[] } | null {
  const start = matchL.findIndex((m) => m === -1)
  if (start === -1) return null
  const matchR = new Map<number, number>()
  matchL.forEach((v, u) => {
    if (v !== -1) matchR.set(v, u)
  })
  const leftSeen = new Set<number>([start])
  const rightSeen = new Set<number>()
  const stack = [start]
  while (stack.length > 0) {
    const u = stack.pop()!
    for (const v of adj[u]) {
      if (rightSeen.has(v)) continue
      rightSeen.add(v)
      const w = matchR.get(v)
      if (w != null && !leftSeen.has(w)) {
        leftSeen.add(w)
        stack.push(w)
      }
    }
  }
  return { left: [...leftSeen], right: [...rightSeen] }
}

export function checkFeasibility(ctx: SolverContext, domains: number[][]): Diagnosis[] {
  const out: Diagnosis[] = []
  const classById = new Map(ctx.input.classes.map((c) => [c.id, c]))
  const teacherById = new Map(ctx.input.teachers.map((t) => [t.id, t]))
  const subjectById = new Map(ctx.input.subjects.map((s) => [s.id, s]))
  const roomById = new Map(ctx.input.rooms.map((r) => [r.id, r]))
  const stageById = new Map(ctx.input.stages.map((s) => [s.id, s]))
  const nameOfUnit = (id: number): string => {
    const u = ctx.units[id]
    const cls = u.classIds.map((c) => classById.get(c)?.name ?? `班级${c}`).join('+')
    return `${cls}「${subjectById.get(u.subjectId)?.name ?? u.subjectId}」`
  }
  const slotLabel = (si: number): string => `周${ctx.slots[si].dayOfWeek} 第${ctx.slots[si].periodIndex}节`

  // ── 一、值域被裁空 ────────────────────────────────────────────────
  for (const u of ctx.units) {
    if (domains[u.id].length > 0) continue
    const all = ctx.windowsByStageSize.get(`${u.stageId}:${u.size}`) ?? []
    const byRule = all.filter((wid) =>
      ctx.windows[wid].every((si) => ctx.ruleValueOf(u.id, si) !== 'FORBIDDEN')
    ).length
    const reason =
      all.length === 0
        ? u.size > 1
          ? `该学段没有 ${u.size} 节同日相邻且不跨上下午分段的位置`
          : '该学段没有任何可排课的教学时段'
        : byRule === 0
          ? '该课的全部候选时段都被「禁排」规则封死了'
          : '候选时段都已被预排锁定、其他课或场地容量占满'
    out.push({
      level: 'error',
      code: 'UNIT_DOMAIN_EMPTY',
      title: `${nameOfUnit(u.id)} 找不到任何可排位置`,
      detail: `候选窗口共 ${all.length} 个，扣除禁排后剩 ${byRule} 个，再扣除已占用后剩 0 个 —— ${reason}`,
      suggestions: [
        '① 放宽该课涉及的禁排时段（把「禁排」改回「常规」）',
        '② 检查这个班/这位教师的预排锁定是否占得过多',
        u.needRoom ? '③ 为该学科增配可用场地，或提高现有场地的同时可上班数' : '③ 适当下调该科周课时'
      ],
      ref: { kind: 'unit', id: u.id }
    })
  }

  // ── 二、资源总量校验 ──────────────────────────────────────────────
  // 2.1 班级
  {
    const need = new Map<number, number>()
    for (const u of ctx.units) for (const c of u.classIds) need.set(c, (need.get(c) ?? 0) + u.size)
    const fixedByClass = new Map<number, number>()
    for (const f of ctx.fixedPlacements) {
      fixedByClass.set(f.classId, (fixedByClass.get(f.classId) ?? 0) + 1)
    }
    for (const c of ctx.input.classes) {
      const stage = stageById.get(c.stageId)
      const supply = stage?.slotIds.length ?? 0
      const demand = (need.get(c.id) ?? 0) + (fixedByClass.get(c.id) ?? 0)
      if (demand > supply) {
        out.push({
          level: 'error',
          code: 'CLASS_SUPPLY',
          title: `${c.name} 的课排不下`,
          detail: `需求 ${demand} 节（含预排 ${fixedByClass.get(c.id) ?? 0} 节），本学段一周只有 ${supply} 个教学时段，缺口 ${demand - supply} 节`,
          suggestions: ['① 下调该班部分学科的周课时', '② 在学段作息里增开时段（如晚自习）'],
          ref: { kind: 'class', id: c.id }
        })
      }
    }
  }

  // 2.2 教师
  {
    const need = new Map<number, number>()
    for (const u of ctx.units) for (const t of u.teacherIds) need.set(t, (need.get(t) ?? 0) + u.size)
    for (const [tid, demand] of need) {
      const teacher = teacherById.get(tid)
      if (!teacher) continue
      // 供给 = 全校教学槽里，该教师没有被禁排、也没有被预排占住的
      const ti = ctx.teacherIdx.get(tid)
      let supply = 0
      for (let si = 0; si < ctx.slots.length; si++) {
        if (!ctx.slots[si].isTeaching) continue
        if (ti != null && ctx.base.teachers.mask(ti, si) === 0b11) continue
        supply += 1
      }
      // 教师规则层面的禁排：借用任一该教师的单元来解析（同一教师规则一致）
      const sample = ctx.units.find((u) => u.teacherIds.includes(tid))
      if (sample) {
        supply = 0
        for (let si = 0; si < ctx.slots.length; si++) {
          if (!ctx.slots[si].isTeaching) continue
          if (ti != null && ctx.base.teachers.mask(ti, si) === 0b11) continue
          if (ctx.ruleValueOf(sample.id, si) === 'FORBIDDEN') continue
          supply += 1
        }
      }
      if (demand > supply) {
        out.push({
          level: 'error',
          code: 'TEACHER_SUPPLY',
          title: `${teacher.name} 的课时排不下`,
          detail: `需排 ${demand} 节，扣除禁排与预排占用后只剩 ${supply} 个可用时段，缺口 ${demand - supply} 节`,
          suggestions: [
            '① 把该教师的部分班级改派给其他教师',
            '② 放宽该教师的禁排时段',
            '③ 减少该教师身上的预排占位'
          ],
          ref: { kind: 'teacher', id: tid }
        })
      }
    }
  }

  // 2.3 需专用场地的学科：班位供给 vs 需求
  {
    const demandBySubject = new Map<number, number>()
    for (const u of ctx.units) {
      if (!u.needRoom) continue
      const per = Math.max(1, u.roomOptions[0]?.slotsTaken ?? 1)
      demandBySubject.set(
        u.subjectId,
        (demandBySubject.get(u.subjectId) ?? 0) + u.size * per * Math.max(1, u.classIds.length)
      )
    }
    for (const [sid, demand] of demandBySubject) {
      const subject = subjectById.get(sid)
      if (!subject) continue
      const rooms = subject.allowedRooms
      const teachingSlots = ctx.slots.filter((s) => s.isTeaching).length
      const supply = rooms.reduce(
        (sum, r) => sum + Math.max(1, roomById.get(r.classroomId)?.concurrentCapacity ?? 1) * teachingSlots,
        0
      )
      if (demand > supply) {
        out.push({
          level: 'error',
          code: 'SUBJECT_ROOM_SUPPLY',
          title: `「${subject.name}」的专用场地不够用`,
          detail:
            `全校需 ${demand} 个班位·节，现有 ${rooms.length} 处场地 × 一周 ${teachingSlots} 个时段 ` +
            `共 ${supply} 个班位·节，缺口 ${demand - supply}`,
          suggestions: [
            '① 增配该学科可用的场地',
            '② 提高现有场地的「同时可上班数」（一块田径场可同时上 4 个班）',
            '③ 下调该学科的周课时'
          ],
          ref: { kind: 'subject', id: sid }
        })
      }
    }
  }

  // ── 三、霍尔条件（精确判定）────────────────────────────────────────
  const matchable = (uid: number): boolean => ctx.units[uid].size === 1 && ctx.units[uid].weekMode === 'all'

  const runMatching = (
    unitIds: number[],
    owner: { code: string; title: string; ref: Diagnosis['ref'] }
  ): void => {
    const picked = unitIds.filter(matchable)
    if (picked.length === 0) return
    const slotOf = new Map<number, number>()
    const adj: number[][] = picked.map((uid) => {
      const list: number[] = []
      for (const wid of domains[uid]) {
        const si = ctx.windows[wid][0]
        let r = slotOf.get(si)
        if (r == null) {
          r = slotOf.size
          slotOf.set(si, r)
        }
        list.push(r)
      }
      return list
    })
    const matchL = hopcroftKarp(picked.length, adj, slotOf.size)
    const unmatched = matchL.filter((m) => m === -1).length
    if (unmatched === 0) return
    const tight = hallTightSet(adj, matchL)
    const leftNames = (tight?.left ?? []).slice(0, 5).map((i) => nameOfUnit(picked[i]))
    const rightSlots = new Map([...slotOf].map(([si, r]) => [r, si]))
    const slotNames = (tight?.right ?? [])
      .slice(0, 5)
      .map((r) => slotLabel(rightSlots.get(r)!))
    out.push({
      level: 'error',
      code: owner.code,
      title: owner.title,
      detail:
        `有 ${tight?.left.length ?? unmatched} 节课只能落在 ${tight?.right.length ?? 0} 个时段里，` +
        `缺口 ${(tight?.left.length ?? unmatched) - (tight?.right.length ?? 0)} 节。` +
        `涉及课程：${leftNames.join('、')}${(tight?.left.length ?? 0) > 5 ? ' 等' : ''}；` +
        `可用时段：${slotNames.join('、')}${(tight?.right.length ?? 0) > 5 ? ' 等' : ''}`,
      suggestions: [
        '① 把上述时段的「禁排/预排」放开一部分',
        '② 将其中几节课改派给其他教师或调整到其他班级时段',
        '③ 增开时段或下调周课时'
      ],
      ref: owner.ref
    })
  }

  const unitsByClass = new Map<number, number[]>()
  const unitsByTeacher = new Map<number, number[]>()
  for (const u of ctx.units) {
    for (const c of u.classIds) {
      const arr = unitsByClass.get(c) ?? []
      arr.push(u.id)
      unitsByClass.set(c, arr)
    }
    for (const t of u.teacherIds) {
      const arr = unitsByTeacher.get(t) ?? []
      arr.push(u.id)
      unitsByTeacher.set(t, arr)
    }
  }
  for (const [cid, ids] of unitsByClass) {
    runMatching(ids, {
      code: 'CLASS_HALL',
      title: `${classById.get(cid)?.name ?? '班级' + cid} 的可用时段不足以摆下全部课程`,
      ref: { kind: 'class', id: cid }
    })
  }
  for (const [tid, ids] of unitsByTeacher) {
    runMatching(ids, {
      code: 'TEACHER_HALL',
      title: `${teacherById.get(tid)?.name ?? '教师' + tid} 的可用时段不足以摆下全部课程`,
      ref: { kind: 'teacher', id: tid }
    })
  }

  return out
}
