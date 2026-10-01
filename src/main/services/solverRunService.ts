import { Worker } from 'node:worker_threads'
import { cpus } from 'node:os'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildSolverInput } from './solverInputService'
import { saveSchedule } from './scheduleResultService'
import type { SolveRequest, SolveSummary, WorkerMessage } from '../solver/protocol'
import type {
  ScheduleEventPayload,
  ScheduleProgressPayload,
  ScheduleStartOptions
} from '@shared/types/ipc'

/**
 * 排课执行编排（M3 后半段，docs/04 §4.4 多起点并行）：
 *
 *   buildSolverInput（主进程，读库）
 *     → N 个 worker 各带一个种子真并行跑 solve()（N = min(CPU, 8)）
 *     → 汇总进度事件 → 全部完成后择优（未排 > 硬违反 > 事实连堂）
 *     → saveSchedule 落库 → done 事件（带版本号与诊断）
 *
 * worker 只做纯计算：输入经 workerData 结构化克隆送入，结果以 SolveSummary
 * 投影送回，ctx 等大对象不出 worker。
 *
 * 取消：solve() 同步占满 worker 事件循环，无法用消息打断——直接 terminate，
 * 引擎无任何资源句柄，硬杀安全；已排到一半的解会被丢弃，不落库。
 */

/** worker 句柄的最小接口（测试注入假实现用；生产包装 worker_threads.Worker） */
export interface WorkerHandle {
  terminate(): void
  onMessage(cb: (m: WorkerMessage) => void): void
  onExit(cb: (code: number) => void): void
}

export type WorkerSpawner = (req: SolveRequest) => WorkerHandle

/** worker 产物位置：开发 = out/main/solverWorker.js；打包后 = app.asar.unpacked 下 */
function resolveWorkerPath(): string {
  // 预览桥 / 测试可显式指定（scripts/dev/ipc-bridge.cjs 会把它指到 esbuild 产物）
  const override = process.env.ZHIKEPAI_SOLVER_WORKER
  if (override && existsSync(override)) return override
  const local = join(__dirname, 'solverWorker.js')
  if (existsSync(local)) return local
  // electron-builder.yml 已把 out/main/solverWorker.js 加入 asarUnpack
  return join(__dirname, '..', '..', 'app.asar.unpacked', 'out', 'main', 'solverWorker.js')
}

const defaultSpawner: WorkerSpawner = (req) => {
  const w = new Worker(resolveWorkerPath(), { workerData: req })
  return {
    terminate: () => {
      void w.terminate()
    },
    onMessage: (cb) => {
      w.on('message', cb)
    },
    onExit: (cb) => {
      w.on('exit', cb)
    }
  }
}

/** docs/04 §4.4：多起点数 = min(CPU, 8) */
export function defaultStarts(): number {
  return Math.max(1, Math.min(cpus().length, 8))
}

interface RunState {
  runId: string
  semesterId: number
  weightProfileCode: string
  totalStarts: number
  cancelled: boolean
  emit: (e: ScheduleEventPayload) => void
  spawner: WorkerSpawner
  workers: {
    handle: WorkerHandle
    summary: SolveSummary | null
    error: string | null
    exited: boolean
    ratio: number
  }[]
}

/** 同一时间只允许一个排课任务（单机单用户，D5） */
let activeRun: RunState | null = null

export function isSolveRunning(): boolean {
  return activeRun != null
}

export function startSolveRun(
  semesterId: number,
  options: ScheduleStartOptions,
  emit: (e: ScheduleEventPayload) => void,
  spawner: WorkerSpawner = defaultSpawner
): string {
  if (activeRun) {
    throw new Error('已有排课任务在进行中，请先取消或等待完成')
  }

  const weightProfileCode = options.weightProfileCode ?? 'balanced'
  const totalStarts = Math.max(1, Math.min(8, options.starts ?? defaultStarts()))
  const budget = options.timeBudgetMs ?? 30_000
  const baseSeed = options.seed ?? 20260929

  // 组装输入快照（IO 全在主进程；worker 只拿到纯数据）
  const input = buildSolverInput(semesterId, weightProfileCode)

  const runId = `run-${Date.now().toString(36)}`
  const run: RunState = {
    runId,
    semesterId,
    weightProfileCode,
    totalStarts,
    cancelled: false,
    emit,
    spawner,
    workers: []
  }
  activeRun = run

  const finish = (): void => {
    if (activeRun === run) activeRun = null

    if (run.cancelled) {
      run.emit({
        type: 'done',
        runId,
        status: 'cancelled',
        versionId: null,
        versionName: null,
        lessonCount: 0,
        lockedCount: 0,
        skippedFixed: 0,
        summary: null
      })
      return
    }

    const summaries = run.workers.map((w) => w.summary).filter((s): s is SolveSummary => s != null)
    if (summaries.length === 0) {
      run.emit({
        type: 'done',
        runId,
        status: 'failed',
        versionId: null,
        versionName: null,
        lessonCount: 0,
        lockedCount: 0,
        skippedFixed: 0,
        summary: null,
        error: run.workers.find((w) => w.error)?.error ?? 'worker 异常退出，未产生结果'
      })
      return
    }

    // 择优：未排 > 硬违反 > 事实连堂（与 solve() 内部多起点同一条次序）
    const scoreOf = (s: SolveSummary): number =>
      s.unplacedCount * 1000 + s.violations.length * 100 + s.stats.accidentalBlocks
    const best = summaries.reduce((a, b) => (scoreOf(b) < scoreOf(a) ? b : a))
    const wallMs = Math.max(...summaries.map((s) => s.stats.elapsedMs))

    let versionId: number | null = null
    let versionName: string | null = null
    let lessonCount = 0
    let lockedCount = 0
    let skippedFixed = 0
    // infeasible（没排出任何课）不建版本；partial 也落库，让用户能看能改
    if (best.lessons.length > 0) {
      const saved = saveSchedule({
        semesterId: run.semesterId,
        weightProfileCode: run.weightProfileCode,
        solveMs: wallMs,
        hardViolations: best.violations.length,
        metrics: { ...best.stats, starts: totalStarts },
        lessons: best.lessons
      })
      versionId = saved.versionId
      versionName = saved.name
      lessonCount = saved.lessonCount
      lockedCount = saved.lockedCount
      skippedFixed = saved.skippedFixed
    }

    run.emit({
      type: 'done',
      runId,
      status: best.status,
      versionId,
      versionName,
      lessonCount,
      lockedCount,
      skippedFixed,
      summary: best
    })
  }

  const checkFinish = (): void => {
    if (run.workers.length < run.totalStarts) return // 还有 worker 没起起来
    if (run.workers.every((w) => w.exited)) finish()
  }

  for (let i = 0; i < totalStarts; i++) {
    // 种子序列与 solve() 内部多起点一致（baseSeed + k * 7919）
    const handle = spawner({ input, seed: baseSeed + i * 7919, starts: 1, timeBudgetMs: budget })
    const w = {
      handle,
      summary: null as SolveSummary | null,
      error: null as string | null,
      exited: false,
      ratio: 0
    }
    run.workers.push(w)

    handle.onMessage((m: WorkerMessage) => {
      if (run.cancelled || activeRun !== run) return
      if (m.type === 'progress') {
        w.ratio = m.progress.ratio
        // 总进度 = 各起点最新进度（已完成的记 1）之和 / 起点数
        const sum = run.workers.reduce((s, x) => s + (x.exited ? 1 : x.ratio), 0)
        const p: ScheduleProgressPayload = {
          type: 'progress',
          runId,
          ratio: Math.min(1, sum / run.totalStarts),
          message: m.progress.message,
          phase: m.progress.phase,
          start: i + 1,
          totalStarts: run.totalStarts
        }
        run.emit(p)
      } else if (m.type === 'done') {
        w.summary = m.summary
        w.ratio = 1
      } else if (m.type === 'error') {
        w.error = m.message
      }
    })

    handle.onExit(() => {
      w.exited = true
      checkFinish()
    })
  }

  return runId
}

/** 取消进行中的排课：terminate 全部 worker，done 事件 status = cancelled */
export function cancelSolveRun(): boolean {
  if (!activeRun) return false
  activeRun.cancelled = true
  for (const w of activeRun.workers) w.handle.terminate()
  return true
}
