/**
 * 阶段 0.4：规则矛盾自检（docs/04 §3.4）。
 *
 * 检查的是**规则之间打架**，而不是资源不够 —— 资源不够归 feasibility 管。
 * 这五条都是教务录入时最容易自相矛盾的地方，报出来能直接指到哪条规则上。
 *
 *   SC_ALL_FORBIDDEN     某条任务的所有候选时段都被禁排
 *   SC_BLOCK_IMPOSSIBLE  要求连堂 k 节，但没有任何一个分段容得下 k 节相邻
 *   SC_MERGE_EMPTY       拼合 / 同时上课组内成员的可用时段交集为空
 *   SC_DAILY_MAX         每日上限 × 上课天数 < 周课时
 *   SC_SPECIAL_ROOM      需专用教室的学科没绑场地 / 场地数 × 槽数不够
 */
import type { SolverContext } from './context'
import type { Diagnosis } from './diagnosis'

export function selfCheckRules(ctx: SolverContext): Diagnosis[] {
  const out: Diagnosis[] = []
  const classById = new Map(ctx.input.classes.map((c) => [c.id, c]))
  const subjectById = new Map(ctx.input.subjects.map((s) => [s.id, s]))
  const stageById = new Map(ctx.input.stages.map((s) => [s.id, s]))

  // ── SC_ALL_FORBIDDEN / SC_BLOCK_IMPOSSIBLE ────────────────────────
  const reportedTask = new Set<number>()
  for (const u of ctx.units) {
    const all = ctx.windowsByStageSize.get(`${u.stageId}:${u.size}`) ?? []
    const label = `${u.classIds.map((c) => classById.get(c)?.name ?? c).join('+')}「${subjectById.get(u.subjectId)?.name ?? u.subjectId}」`
    if (u.size > 1 && all.length === 0) {
      const key = u.taskIds[0] * 100 + u.size
      if (reportedTask.has(key)) continue
      reportedTask.add(key)
      out.push({
        level: 'error',
        code: 'SC_BLOCK_IMPOSSIBLE',
        title: `${label} 要求连堂 ${u.size} 节，但作息里排不出来`,
        detail: `本学段的上午/下午/晚上各分段内，都找不到 ${u.size} 节连续且都是教学时段的位置`,
        suggestions: [
          '① 把连堂节数改小（例如 3 节改 2 节）',
          '② 在作息里让该分段多排几节课，或取消夹在中间的非教学时段'
        ],
        ref: { kind: 'task', id: u.taskIds[0] }
      })
      continue
    }
    const usable = all.filter((wid) =>
      ctx.windows[wid].every((si) => ctx.ruleValueOf(u.id, si) !== 'FORBIDDEN')
    )
    if (all.length > 0 && usable.length === 0 && !reportedTask.has(u.taskIds[0])) {
      reportedTask.add(u.taskIds[0])
      out.push({
        level: 'error',
        code: 'SC_ALL_FORBIDDEN',
        title: `${label} 的全部可排时段都被禁排规则封死`,
        detail: `该学段共 ${all.length} 个候选位置，逐级合并规则（教师/班级/学科/年级/全局，取最严）后一个都不剩`,
        suggestions: [
          '① 检查该教师与该班级的禁排是否叠加过度',
          '② 学科级禁排往往覆盖面最大，优先放宽它',
          '③ 全局禁排（如周五第 8 节）会作用于所有课，谨慎使用'
        ],
        ref: { kind: 'task', id: u.taskIds[0] }
      })
    }
  }

  // ── SC_MERGE_EMPTY ────────────────────────────────────────────────
  for (const g of ctx.input.constraintGroups) {
    if (g.hardness !== 'hard') continue
    if (g.groupType !== 'merge' && g.groupType !== 'simultaneous') continue
    const taskIds = g.members.filter((m) => m.memberType === 'task').map((m) => m.memberId)
    if (taskIds.length < 2) continue
    const perTask = taskIds.map((tid) => {
      const u = ctx.units.find((x) => x.taskIds.includes(tid))
      if (!u) return null
      const all = ctx.windowsByStageSize.get(`${u.stageId}:${u.size}`) ?? []
      return new Set(
        all
          .filter((wid) => ctx.windows[wid].every((si) => ctx.ruleValueOf(u.id, si) !== 'FORBIDDEN'))
          .flatMap((wid) => ctx.windows[wid])
      )
    })
    if (perTask.some((s) => s == null)) continue
    const sets = perTask as Set<number>[]
    const inter = [...sets[0]].filter((si) => sets.every((s) => s.has(si)))
    if (inter.length === 0) {
      out.push({
        level: 'error',
        code: 'SC_MERGE_EMPTY',
        title: `约束组「${g.name}」的成员凑不到同一个时段`,
        detail: '组内任务要求同时上课，但它们各自的可用时段没有交集（学段作息不同或禁排相斥）',
        suggestions: [
          '① 确认组内班级是否属于同一学段（跨学段作息不同，本就无法同时上课）',
          '② 放宽其中一方的禁排',
          '③ 若并非必须同时，把该组的强度从「硬」改为「软」'
        ]
      })
    }
  }

  // ── SC_DAILY_MAX ──────────────────────────────────────────────────
  {
    const need = new Map<string, number>()
    for (const t of ctx.input.tasks) {
      const k = `${t.classId}:${t.subjectId}`
      need.set(k, (need.get(k) ?? 0) + t.weeklyPeriods)
    }
    for (const [k, weekly] of need) {
      const [cid, sid] = k.split(':').map(Number)
      const subject = subjectById.get(sid)
      const cls = classById.get(cid)
      if (!subject || !cls) continue
      const days = stageById.get(cls.stageId)?.daysPerWeek ?? 5
      const cap = Math.max(0, subject.dailyMax) * days
      if (subject.dailyMax > 0 && weekly > cap) {
        out.push({
          level: 'warn',
          code: 'SC_DAILY_MAX',
          title: `${cls.name}「${subject.name}」的每日上限与周课时矛盾`,
          detail: `周课时 ${weekly} 节，每日上限 ${subject.dailyMax} 节 × ${days} 天 = 最多 ${cap} 节`,
          suggestions: [
            `① 把「${subject.name}」的每日上限提到 ${Math.ceil(weekly / days)} 节`,
            '② 或下调该班该科的周课时'
          ],
          ref: { kind: 'subject', id: sid }
        })
      }
    }
  }

  // ── SC_SPECIAL_ROOM ───────────────────────────────────────────────
  {
    const used = new Set(ctx.units.filter((u) => u.needRoom).map((u) => u.subjectId))
    for (const sid of used) {
      const s = subjectById.get(sid)
      if (!s) continue
      if (s.allowedRooms.length === 0) {
        out.push({
          level: 'error',
          code: 'SC_SPECIAL_ROOM',
          title: `「${s.name}」标为需要专用教室，却没绑定任何场地`,
          detail: '没有候选场地时，这门课的每一节都无处可放',
          suggestions: ['① 在学科设置里为它绑定可用场地', '② 或取消「需要专用教室」勾选'],
          ref: { kind: 'subject', id: sid }
        })
      }
    }
  }

  return out
}
