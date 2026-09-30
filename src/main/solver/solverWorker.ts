import { parentPort, workerData } from 'node:worker_threads'
import { solve } from '@solver/solve'
import type { SolveRequest, WorkerMessage } from './protocol'

/**
 * 排课 worker 入口（构建为独立产物 out/main/solverWorker.js，见 electron.vite.config.ts）。
 *
 * 职责只有一件事：拿 workerData 里的 SolverInput 调 `solve()`，把进度与结果
 * 投影发回主进程。引擎本身零 IO，这里不碰数据库——落库在主进程完成。
 *
 * 取消：主进程 `terminate()`（见 protocol.ts 的说明），本入口无需处理取消消息。
 */

const req = workerData as SolveRequest
const post = (m: WorkerMessage): void => {
  parentPort?.postMessage(m)
}

try {
  const result = solve(req.input, {
    seed: req.seed,
    starts: req.starts,
    timeBudgetMs: req.timeBudgetMs,
    onProgress: (progress) => post({ type: 'progress', progress })
  })
  post({
    type: 'done',
    summary: {
      status: result.status,
      seed: req.seed,
      unplacedCount: result.unplaced.length,
      violations: result.violations,
      diagnostics: result.diagnostics,
      lessons: result.lessons,
      stats: result.stats
    }
  })
} catch (err) {
  post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
}
