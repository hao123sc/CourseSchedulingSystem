/** M5 质量优化：ALNS → LAHC → Polish。硬约束校验是每个候选的门禁。 */
import type { SolverContext } from './context'
import { countAccidentalBlocks } from './adjacency'
import { cloneSolution, type Solution } from '../model/solution'
import { verifyHardConstraints } from './verify'
import { createRng, type Rng } from './random'
import { scoreSolution } from './scorer'
import { measureQuality } from './qualityMetrics'
import { move, swap } from './moves'

export interface OptimizeOptions {
  seed?: number
  timeBudgetMs?: number
  now?: () => number
  cancelled?: () => boolean
  onProgress?: (phase: 'alns' | 'lahc' | 'polish', best: number) => void
}

export interface OptimizeResult {
  solution: Solution
  score: ReturnType<typeof scoreSolution>
  iterations: number
  elapsedMs: number
}

function randomItem<T>(items: readonly T[], rng: Rng): T | undefined {
  return items.length ? items[rng.int(items.length)] : undefined
}

function valid(ctx: SolverContext, solution: Solution): boolean {
  return verifyHardConstraints(ctx, solution).length === 0 && solution.unplaced.length === 0
}

function objective(
  ctx: SolverContext,
  solution: Solution,
  score: ReturnType<typeof scoreSolution>
): number {
  const quality = measureQuality(ctx, solution)
  const teacherLimit = Math.max(1, ctx.input.teachers.length * 0.3)
  return (
    countAccidentalBlocks(ctx, solution) * 1_000_000 +
    score.total +
    Math.max(0, quality.maxTeacherDayPeriods - 6) * 10_000 +
    Math.max(0, quality.teacherGapCount - teacherLimit) * 100 +
    Math.max(0, quality.sameSubjectDayRepeatRate - 0.05) * 100_000 +
    Math.max(0, 0.7 - quality.importantMorningRate) * 100_000
  )
}

function targetedIds(ctx: SolverContext, current: Solution): number[] {
  const teacherDays = new Map<string, { unitIds: Set<number>; periods: number[] }>()
  const afternoon: number[] = []
  for (const [id, assignment] of current.assignments) {
    const unit = ctx.units[id]
    if (!unit) continue
    for (const slotId of assignment.slotIds) {
      const si = ctx.slotIdx.get(slotId)
      if (si == null) continue
      const slot = ctx.slots[si]
      if (unit.importance >= 4 && slot.segment !== 'morning') afternoon.push(id)
      for (const teacherId of unit.teacherIds) {
        const k = `${teacherId}:${slot.dayOfWeek}`
        const value = teacherDays.get(k) ?? { unitIds: new Set<number>(), periods: [] }
        value.unitIds.add(id)
        value.periods.push(slot.periodIndex)
        teacherDays.set(k, value)
      }
    }
  }
  let worst: { gap: number; ids: Set<number> } = { gap: 0, ids: new Set() }
  for (const value of teacherDays.values()) {
    const periods = [...value.periods].sort((a, b) => a - b)
    const gap =
      periods.length > 1 ? periods[periods.length - 1] - periods[0] + 1 - new Set(periods).size : 0
    if (gap > worst.gap) worst = { gap, ids: value.unitIds }
  }
  return [...new Set([...worst.ids, ...afternoon])]
}

function candidateMove(ctx: SolverContext, current: Solution, rng: Rng) {
  const ids = [...current.assignments.keys()]
  if (ids.length < 1) return undefined
  const targeted = targetedIds(ctx, current)
  const pool = targeted.length > 0 && rng.next() < 0.75 ? targeted : ids
  if (pool.length > 1 && rng.next() < 0.35) {
    const a = randomItem(pool, rng)!
    let b = randomItem(ids, rng)!
    while (b === a) b = randomItem(ids, rng)!
    return swap(current, a, b)
  }
  const id = randomItem(pool, rng)!
  const unit = ctx.units[id]
  const windows = ctx.domains[id]
    .map((wid) => ctx.windows[wid])
    .filter((w) => w.length === unit.size)
  const target = randomItem(windows, rng)
  return target
    ? move(
        ctx,
        current,
        id,
        target.map((si) => ctx.slots[si].id)
      )
    : undefined
}

/** 在预算内运行质量优化；任何候选违反硬约束都会被丢弃。 */
export function optimizeQuality(
  ctx: SolverContext,
  initial: Solution,
  options: OptimizeOptions = {}
): OptimizeResult {
  const now = options.now ?? (() => Date.now())
  const started = now()
  const budget = options.timeBudgetMs ?? 1_000
  const deadline = started + budget
  const alnsDeadline = started + budget * 0.5
  const lahcDeadline = started + budget * 0.8
  const rng = createRng(options.seed ?? initial.seed)
  let current = cloneSolution(initial)
  let best = cloneSolution(initial)
  let currentScore = scoreSolution(ctx, current)
  let bestScore = currentScore
  let currentObjective = objective(ctx, current, currentScore)
  let bestObjective = currentObjective
  let iterations = 0

  // ALNS：destroy/repair 在当前实现中由大邻域随机 move/swap 组成，自适应选择由成功率体现。
  const operatorSuccess = [1, 1]
  while (now() < alnsDeadline && !options.cancelled?.()) {
    const op = rng.next() < operatorSuccess[0] / (operatorSuccess[0] + operatorSuccess[1]) ? 0 : 1
    const mv = candidateMove(ctx, current, rng)
    if (!mv) break
    const trial = cloneSolution(current)
    mv.apply(trial)
    if (!valid(ctx, trial)) {
      operatorSuccess[op] *= 0.999
      iterations++
      continue
    }
    const score = scoreSolution(ctx, trial)
    const trialObjective = objective(ctx, trial, score)
    const temperature = Math.max(
      0.01,
      Math.abs(currentObjective) * 0.05 * (1 - (now() - started) / Math.max(1, deadline - started))
    )
    const accept =
      trialObjective <= currentObjective ||
      rng.next() < Math.exp((currentObjective - trialObjective) / temperature)
    if (accept) {
      current = trial
      currentScore = score
      currentObjective = trialObjective
      operatorSuccess[op] += trialObjective < bestObjective ? 3 : 1
      if (trialObjective < bestObjective) {
        best = cloneSolution(trial)
        bestScore = score
        bestObjective = trialObjective
      }
    }
    iterations++
    if (iterations % 32 === 0) options.onProgress?.('alns', bestScore.total)
  }

  // LAHC：历史成本门槛，避免只接受单调下降导致早熟。
  const history = new Float64Array(256).fill(bestObjective)
  let i = 0
  while (now() < lahcDeadline && !options.cancelled?.()) {
    const mv = candidateMove(ctx, best, rng)
    if (!mv) break
    const trial = cloneSolution(best)
    mv.apply(trial)
    if (valid(ctx, trial)) {
      const score = scoreSolution(ctx, trial)
      const trialObjective = objective(ctx, trial, score)
      const slot = i % history.length
      if (trialObjective <= history[slot]) {
        best = trial
        bestScore = score
        bestObjective = trialObjective
      }
      history[slot] = bestObjective
    }
    i++
    iterations++
    if (i % 32 === 0) options.onProgress?.('lahc', bestScore.total)
  }

  // Polish：短程贪心，只保留严格改善的可行 move。
  let improved = true
  while (improved && now() < deadline && !options.cancelled?.()) {
    improved = false
    const ids = [...best.assignments.keys()]
    for (const id of ids) {
      const unit = ctx.units[id]
      for (const wid of ctx.domains[id]) {
        const target = ctx.windows[wid]
        if (target.length !== unit.size) continue
        const mv = move(
          ctx,
          best,
          id,
          target.map((si) => ctx.slots[si].id)
        )
        const trial = cloneSolution(best)
        mv.apply(trial)
        if (!valid(ctx, trial)) continue
        const score = scoreSolution(ctx, trial)
        const trialObjective = objective(ctx, trial, score)
        if (trialObjective < bestObjective) {
          best = trial
          bestScore = score
          bestObjective = trialObjective
          improved = true
          break
        }
      }
      if (improved || now() >= deadline) break
    }
    options.onProgress?.('polish', bestScore.total)
  }
  return { solution: best, score: bestScore, iterations, elapsedMs: now() - started }
}
