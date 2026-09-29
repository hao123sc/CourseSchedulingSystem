import type { IpcApi } from '@shared/types/ipc'

type ApiShape = {
  [K in keyof IpcApi]: (...args: Parameters<IpcApi[K]>) => Promise<ReturnType<IpcApi[K]>>
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
 * 类型化 IPC 客户端的唯一入口。渲染层一律 `import { api } from '@renderer/lib/api'`，
 * 禁止直接摸 window.zhikepai / ipcRenderer。类型来自 preload 暴露的 ZhikepaiApi。
 */
export const api: ApiShape =
  window.zhikepai ?? (import.meta.env.DEV ? createHttpBridge() : (undefined as never))
