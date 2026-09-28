import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { IpcApi } from '@shared/types/ipc'

/**
 * 类型化 IPC 客户端：每个通道都是 `invoke` 的薄封装，禁止渲染进程直接拿到 ipcRenderer。
 * 新增通道时先在 `@shared/types/ipc.ts` 的 IpcApi 声明签名，再在这里加一行转发。
 */
const zhikepaiApi: {
  [K in keyof IpcApi]: (...args: Parameters<IpcApi[K]>) => Promise<ReturnType<IpcApi[K]>>
} = {
  'system:ping': () => ipcRenderer.invoke('system:ping'),
  'healthCheck:list': () => ipcRenderer.invoke('healthCheck:list'),
  'healthCheck:insert': (message: string) => ipcRenderer.invoke('healthCheck:insert', message)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('zhikepai', zhikepaiApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // 仅在 contextIsolation 关闭的调试场景下兜底，正式版本恒为 true
  window.electron = electronAPI
  window.zhikepai = zhikepaiApi
}

export type ZhikepaiApi = typeof zhikepaiApi
