import { registerSystemIpc } from './system.ipc'
import { registerHealthCheckIpc } from './healthCheck.ipc'

/** 统一注册全部 IPC handler，main/index.ts 只需调用这一个函数 */
export function registerAllIpc(): void {
  registerSystemIpc()
  registerHealthCheckIpc()
}
