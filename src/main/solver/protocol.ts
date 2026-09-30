import type { SolveProgress } from '@solver/solve'
import type { SolveSummaryPayload } from '@shared/types/ipc'
import type { SolverInput } from '@solver/model/types'

/**
 * 主进程 ↔ 排课 worker 的消息协议（worker_threads）。
 *
 * 分层纪律：引擎 `src/solver/**` 纯 TS 零 IO；本文件与 worker 入口都在
 * `src/main/solver/`（主进程侧），是引擎之外唯一 import Node 模块的地方。
 *
 * 消息单向流出（worker → 主进程）：
 *   progress —— solve() 的 onProgress 转发，驱动进度条
 *   done     —— 结果投影（SolveSummary），ctx 等大对象留在 worker 里不外带
 *   error    —— 求解抛异常时的错误消息
 *
 * 取消不走路由消息：solve() 是同步 CPU 密集函数，求解期间 worker 的事件循环
 * 被占满，postMessage 进不来。取消 = 主进程直接 `worker.terminate()`——
 * 引擎没有任何资源句柄（无 IO、无共享状态），硬杀无副作用。
 */

/** workerData：一次求解请求（回调不能跨线程，都在 options 之外） */
export interface SolveRequest {
  input: SolverInput
  seed: number
  /** 恒为 1：多起点并行 = 主进程起 N 个 worker 各带一个种子（docs/04 §4.4） */
  starts: number
  timeBudgetMs: number
}

/** solve() 结果的跨线程投影：与渲染端事件载荷是同一份形状（shared/types/ipc.ts） */
export type SolveSummary = SolveSummaryPayload

export type WorkerMessage =
  | { type: 'progress'; progress: SolveProgress }
  | { type: 'done'; summary: SolveSummary }
  | { type: 'error'; message: string }
