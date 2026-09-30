import type { IpcApi, ScheduleEventPayload } from '@shared/types/ipc'

type ApiShape = {
  [K in keyof IpcApi]: (...args: Parameters<IpcApi[K]>) => Promise<ReturnType<IpcApi[K]>>
}

export type ScheduleEventApi = {
  onScheduleEvent: (cb: (payload: ScheduleEventPayload) => void) => () => void
}

/**
 * 浏览器预览模式（`npm run preview:ui`）下的替身：把 `api['域:动作'](...args)`
 * 转成 `POST /api/ipc`，由 vite 中间件交给真实的主进程 IPC handler 执行。
 * Electron 里 window.zhikepai 一定存在，走不到这里；生产构建时整段会被摇掉。
 */
function createHttpBridge(): ApiShape {
  return new Proxy({} as ApiShape, {
    get(_target, channel: string) {
      return async (...args: unknown[]): Promise<unknown> => {
        const res = await fetch('/api/ipc', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ channel, args })
        })
        const payload = (await res.json()) as { result?: unknown; error?: string }
        if (!res.ok || payload.error) throw new Error(payload.error ?? `IPC ${channel} 调用失败`)
        return payload.result
      }
    }
  })
}

/**
 * 预览模式下的事件替身：轮询 GET /api/schedule-events（预览桥把 webContents.send
 * 收进队列，从这个端点取走）。Electron 里 window.zhikepai.onScheduleEvent 一定存在，
 * 走不到这里；生产构建时整段会被摇掉。
 */
function createHttpEventBridge(): ScheduleEventApi {
  return {
    onScheduleEvent(cb) {
      let stopped = false
      let timer: number | undefined
      const poll = async (): Promise<void> => {
        try {
          const res = await fetch('/api/schedule-events')
          if (res.ok) {
            const payload = (await res.json()) as { events?: ScheduleEventPayload[] }
            for (const ev of payload.events ?? []) cb(ev)
          }
        } catch {
          /* 预览服务器瞬时不可达时静默重试 */
        }
        if (!stopped) timer = window.setTimeout(poll, 400)
      }
      void poll()
      return () => {
        stopped = true
        if (timer != null) window.clearTimeout(timer)
      }
    }
  }
}

/**
 * 类型化 IPC 客户端的唯一入口。渲染层一律 `import { api } from '@renderer/lib/api'`，
 * 禁止直接摸 window.zhikepai / ipcRenderer。类型来自 preload 暴露的 ZhikepaiApi。
 */
export const api: ApiShape =
  window.zhikepai ?? (import.meta.env.DEV ? createHttpBridge() : (undefined as never))

/** 事件订阅（Main → Renderer）。预览模式下自动退化为轮询。 */
export const scheduleEvents: ScheduleEventApi =
  typeof window.zhikepai?.onScheduleEvent === 'function'
    ? { onScheduleEvent: (cb) => window.zhikepai.onScheduleEvent(cb) }
    : import.meta.env.DEV
      ? createHttpEventBridge()
      : (undefined as never)
