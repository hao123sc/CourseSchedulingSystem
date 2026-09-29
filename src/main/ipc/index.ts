import { registerSystemIpc } from './system.ipc'
import { registerHealthCheckIpc } from './healthCheck.ipc'
import { registerSetupIpc } from './setup.ipc'
import { registerBaseDataIpc } from './baseData.ipc'
import { registerExcelIpc } from './excel.ipc'

/** 统一注册全部 IPC handler，main/index.ts 只需调用这一个函数 */
export function registerAllIpc(): void {
  registerSystemIpc()
  registerHealthCheckIpc()
  registerSetupIpc()
  registerBaseDataIpc()
  registerExcelIpc()
}
