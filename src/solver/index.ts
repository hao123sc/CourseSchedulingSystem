/**
 * 排课引擎公开出口。
 *
 * 纪律：`src/solver/**` 纯 TS、零 IO，禁止 import Electron / Node（worker 入口除外）。
 * 主进程从库里组装 `SolverInput`（见 src/main/services/solverInputService.ts），
 * 调 `solve()` 拿到 `SolveResult`，再把 `lessons` 落库。
 */
export * from './model/types'
export * from './model/solution'
export { validateSolverInput } from './model/validate'
export type { SolverInputReport, SolverInputIssue } from './model/validate'
export { buildContext } from './core/context'
export type { SolverContext } from './core/context'
export { ac3 } from './core/ac3'
export { checkFeasibility } from './core/feasibility'
export { selfCheckRules } from './core/selfcheck'
export { construct } from './core/dsatur'
export { minConflictsRepair } from './core/minConflicts'
export { verifyHardConstraints } from './core/verify'
export { Board } from './core/board'
export { Occupancy, WeekBitmap, WeekCounter } from './core/occupancy'
export { createRng } from './core/random'
export type { Diagnosis } from './core/diagnosis'
export { solve, toPlacedLessons } from './solve'
export type { SolveOptions, SolveResult, SolveProgress, SolveStatus } from './solve'
export { move, blockMove, swap, kempe, ruinRecreate, hungarian } from './core/moves'
export type { Move, MoveKind } from './core/moves'
export { optimizeQuality } from './core/optimizer'
export type { OptimizeOptions, OptimizeResult } from './core/optimizer'
export { measureQuality, assertQualityMetrics } from './core/qualityMetrics'
export type { QualityMetrics } from './core/qualityMetrics'
export {
  scoreSolution,
  buildScoreCache,
  updateScoreCache,
  deltaScore,
  SOFT_CODES
} from './core/scorer'
export type { ScoreResult, ScoreCache, ScoreBreakdown, SoftCode } from './core/scorer'
