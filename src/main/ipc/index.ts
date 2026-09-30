import { registerSystemIpc } from './system.ipc'
import { registerHealthCheckIpc } from './healthCheck.ipc'
import { registerSetupIpc } from './setup.ipc'
import { registerBaseDataIpc } from './baseData.ipc'
import { registerExcelIpc } from './excel.ipc'
import { registerTeachingIpc } from './teaching.ipc'
import { registerRulesIpc } from './rules.ipc'
import { registerSolverIpc } from './solver.ipc'
import { registerScheduleIpc } from './schedule.ipc'

/** 统一注册全部 IPC handler，main/index.ts 只需调用这一个函数 */
export function registerAllIpc(): void {
  registerSystemIpc()
  registerHealthCheckIpc()
  registerSetupIpc()
  registerBaseDataIpc()
  registerExcelIpc()
  registerTeachingIpc()
  registerRulesIpc()
  registerSolverIpc()
  registerScheduleIpc()
}
