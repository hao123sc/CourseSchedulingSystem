/**
 * 引擎入口：SolverInput → Solution（阶段 0 预处理 + 阶段 1 构造，docs/04 §2）。
 *
 * M3 只做到「硬约束 = 0」，软约束优化（ALNS / LAHC / Polish）是 M5 的事，
 * 这里预留了 `phase` 事件与时间预算接口，M5 直接往后接即可。
 *
 * 纯 TS、零 IO、可复现：同一个 input + 同一个 seed 必然得到同一张课表。
 * 多起点在本文件内是**顺序**跑若干个种子取最好的；真并行由 M3 后半段的 Worker 封装提供，
 * 两者用的是同一个 `solveOnce`。
 */
import type { SolverInput } from './model/types'
import type { HardViolation, PlacedLesson, Solution } from './model/solution'
import { buildContext, type SolverContext } from './core/context'
import { ac3 } from './core/ac3'
import { checkFeasibility } from './core/feasibility'
import { selfCheckRules } from './core/selfcheck'
import { construct } from './core/dsatur'
import { minConflictsRepair } from './core/minConflicts'
import { verifyHardConstraints } from './core/verify'
import { createRng } from './core/random'
import type { Diagnosis } from './core/diagnosis'

export type SolvePhase = 'preprocess' | 'construct' | 'repair' | 'verify' | 'done'

export interface SolveProgress {
  phase: SolvePhase
  /** 0~1 */
  ratio: number
  message: string
  /** 当前起点序号（从 1 计） */
  start: number
  totalStarts: number
}

export interface SolveOptions {
  seed?: number
  /** 多起点数量，默认 1；Worker 层会按 CPU 数下发 */
  starts?: number
  /** 构造阶段总时间预算（毫秒），默认 30s */
  timeBudgetMs?: number
  onProgress?: (p: SolveProgress) => void
  cancelled?: () => boolean
  now?: () => number
  /** 走班学生群体（H11），当前 SolverInput 尚未携带，留给 M9 */
  studentGroups?: Map<number, number[]>
}

export type SolveStatus = 'solved' | 'partial' | 'infeasible' | 'cancelled'

export interface SolveResult {
  status: SolveStatus
  ctx: SolverContext
  solution: Solution
  /** 没能排进去的单元 */
  unplaced: number[]
  /** 硬约束违反（验收口径：必须为 0） */
  violations: HardViolation[]
  /** 无解 / 风险诊断，平实可执行 */
  diagnostics: Diagnosis[]
  lessons: PlacedLesson[]
  stats: {
    units: number
    periods: number
    assignedPeriods: number
    fixedPeriods: number
    starts: number
    elapsedMs: number
    prunedByAc3: number
  }
}

/** 把解展开成一节一节的课，供落库（lesson 表）与课表展示使用 */
export function toPlacedLessons(ctx: SolverContext, sol: Solution): PlacedLesson[] {
  const out: PlacedLesson[] = []
  for (const [unitId, a] of sol.assignments) {
    const u = ctx.units[unitId]
    if (!u) continue
    a.slotIds.forEach((slotId, i) => {
      u.taskIds.forEach((taskId, k) => {
        const ci = Math.min(k, u.classIds.length - 1)
        const classId = u.classIds[ci]
        const teacherId = u.teacherIds[Math.min(k, u.teacherIds.length - 1)] ?? null
        out.push({
          taskId,
          classId,
          subjectId: u.subjectId,
          teacherId,
          classroomId: a.roomIds[ci] ?? null,
          slotId,
          weekMode: u.weekMode,
          blockIndex: i,
          blockSize: u.size
        })
      })
    })
  }
  return out
}

export function solve(input: SolverInput, options: SolveOptions = {}): SolveResult {
  const now = options.now ?? ((): number => Date.now())
  const started = now()
  const starts = Math.max(1, options.starts ?? 1)
  const budget = options.timeBudgetMs ?? 30_000
  const baseSeed = options.seed ?? 20260929
  const emit = (p: SolveProgress): void => options.onProgress?.(p)

  // ── 阶段 0：预处理与自检 ──────────────────────────────────────────
  emit({ phase: 'preprocess', ratio: 0.02, message: '正在建模…', start: 1, totalStarts: starts })
  const ctx = buildContext(input)
  const pruned = ac3(ctx)
  const diagnostics: Diagnosis[] = [
    ...selfCheckRules(ctx),
    ...checkFeasibility(ctx, pruned.domains)
  ]
  emit({
    phase: 'preprocess',
    ratio: 0.1,
    message: `值域裁剪完成，剔除 ${pruned.removed} 个候选位置`,
    start: 1,
    totalStarts: starts
  })

  const periods = ctx.units.reduce((s, u) => s + u.size * Math.max(1, u.taskIds.length), 0)
  const fixedPeriods = ctx.fixedPlacements.length

  const fail = (status: SolveStatus, sol: Solution, unplaced: number[]): SolveResult => ({
    status,
    ctx,
    solution: sol,
    unplaced,
    violations: verifyHardConstraints(ctx, sol, { studentGroups: options.studentGroups }),
    diagnostics,
    lessons: toPlacedLessons(ctx, sol),
    stats: {
      units: ctx.units.length,
      periods,
      assignedPeriods: [...sol.assignments.values()].reduce((s, a) => s + a.slotIds.length, 0),
      fixedPeriods,
      starts,
      elapsedMs: now() - started,
      prunedByAc3: pruned.removed
    }
  })

  // 值域被裁空 = 铁定无解，不必再跑构造，直接给诊断
  if (pruned.wipeouts.length > 0) {
    return fail('infeasible', { assignments: new Map(), unplaced: pruned.wipeouts, seed: baseSeed }, pruned.wipeouts)
  }

  // ── 阶段 1：构造（多起点取优）────────────────────────────────────
  let best: { sol: Solution; unplaced: number[]; violations: HardViolation[] } | null = null
  for (let k = 0; k < starts; k++) {
    if (options.cancelled?.()) break
    const seed = baseSeed + k * 7919
    const rng = createRng(seed)
    emit({
      phase: 'construct',
      ratio: 0.1 + (0.6 * k) / starts,
      message: `第 ${k + 1} / ${starts} 个起点：DSATUR 构造中…`,
      start: k + 1,
      totalStarts: starts
    })
    const { board, unplaced } = construct(ctx, pruned.domains, rng)

    emit({
      phase: 'repair',
      ratio: 0.1 + (0.6 * (k + 0.5)) / starts,
      message: `min-conflicts 修复 ${unplaced.length} 节未排课…`,
      start: k + 1,
      totalStarts: starts
    })
    const rest = minConflictsRepair(ctx, board, pruned.domains, unplaced, rng, {
      deadline: started + budget,
      now,
      cancelled: options.cancelled
    })

    const sol = board.toSolution(seed, rest)
    const violations = verifyHardConstraints(ctx, sol, { studentGroups: options.studentGroups })
    const score = rest.length * 1000 + violations.length
    const bestScore = best ? best.unplaced.length * 1000 + best.violations.length : Infinity
    if (score < bestScore) best = { sol, unplaced: rest, violations }
    if (rest.length === 0 && violations.length === 0) break
    if (now() - started > budget) break
  }

  if (!best) {
    return fail('cancelled', { assignments: new Map(), unplaced: ctx.units.map((u) => u.id), seed: baseSeed }, ctx.units.map((u) => u.id))
  }

  emit({ phase: 'verify', ratio: 0.9, message: '校验硬约束…', start: starts, totalStarts: starts })

  const status: SolveStatus = options.cancelled?.()
    ? 'cancelled'
    : best.unplaced.length === 0 && best.violations.length === 0
      ? 'solved'
      : best.unplaced.length > 0 && best.sol.assignments.size === 0
        ? 'infeasible'
        : 'partial'

  // 有课没排进去 → 补一份「为什么排不进」的诊断，别让用户对着空白发呆
  if (best.unplaced.length > 0) {
    const classById = new Map(input.classes.map((c) => [c.id, c]))
    const subjectById = new Map(input.subjects.map((s) => [s.id, s]))
    for (const uid of best.unplaced.slice(0, 20)) {
      const u = ctx.units[uid]
      diagnostics.push({
        level: 'error',
        code: 'UNIT_UNPLACED',
        title: `${u.classIds.map((c) => classById.get(c)?.name ?? c).join('+')}「${subjectById.get(u.subjectId)?.name ?? u.subjectId}」有 ${u.size} 节没排进去`,
        detail: `候选位置 ${pruned.domains[uid].length} 个，全部被其他课或预排锁定占满`,
        suggestions: [
          '① 放宽该班/该教师的禁排时段',
          '② 检查预排锁定是否占了太多格子',
          '③ 若是需专用场地的课，考虑增配场地或提高同时可上班数'
        ],
        ref: { kind: 'unit', id: uid }
      })
    }
  }

  const result = fail(status, best.sol, best.unplaced)
  emit({ phase: 'done', ratio: 1, message: '完成', start: starts, totalStarts: starts })
  return result
}
