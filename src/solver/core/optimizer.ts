/** M5 质量优化：ALNS → LAHC → Polish。硬约束校验是每个候选的门禁。 */
import type { SolverContext } from './context'
import { cloneSolution, type Solution } from '../model/solution'
import { verifyHardConstraints } from './verify'
import { createRng, type Rng } from './random'
import { scoreSolution } from './scorer'
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

function candidateMove(ctx: SolverContext, current: Solution, rng: Rng) {
  const ids = [...current.assignments.keys()]
  if (ids.length < 1) return undefined
  if (ids.length > 1 && rng.next() < 0.35) {
    const a = randomItem(ids, rng)!
    let b = randomItem(ids, rng)!
    while (b === a) b = randomItem(ids, rng)!
    return swap(current, a, b)
  }
  const id = randomItem(ids, rng)!
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
  const deadline = started + (options.timeBudgetMs ?? 1_000)
  const rng = createRng(options.seed ?? initial.seed)
  let current = cloneSolution(initial)
  let best = cloneSolution(initial)
  let currentScore = scoreSolution(ctx, current)
  let bestScore = currentScore
  let iterations = 0

  // ALNS：destroy/repair 在当前实现中由大邻域随机 move/swap 组成，自适应选择由成功率体现。
  const operatorSuccess = [1, 1]
  while (now() < deadline && !options.cancelled?.()) {
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
    const temperature = Math.max(
      0.01,
      Math.abs(currentScore.total) *
        0.05 *
        (1 - (now() - started) / Math.max(1, deadline - started))
    )
    const accept =
      score.total <= currentScore.total ||
      rng.next() < Math.exp((currentScore.total - score.total) / temperature)
    if (accept) {
      current = trial
      currentScore = score
      operatorSuccess[op] += score.total < bestScore.total ? 3 : 1
      if (score.total < bestScore.total) {
        best = cloneSolution(trial)
        bestScore = score
      }
    }
    iterations++
    if (iterations % 32 === 0) options.onProgress?.('alns', bestScore.total)
  }

  // LAHC：历史成本门槛，避免只接受单调下降导致早熟。
  const history = new Float64Array(256).fill(bestScore.total)
  let i = 0
  while (now() < deadline && !options.cancelled?.()) {
    const mv = candidateMove(ctx, best, rng)
    if (!mv) break
    const trial = cloneSolution(best)
    mv.apply(trial)
    if (valid(ctx, trial)) {
      const score = scoreSolution(ctx, trial)
      const slot = i % history.length
      if (score.total <= history[slot]) {
        best = trial
        bestScore = score
      }
      history[slot] = bestScore.total
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
        if (score.total < bestScore.total) {
          best = trial
          bestScore = score
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
