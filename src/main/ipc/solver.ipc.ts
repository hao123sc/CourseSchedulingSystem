import { ipcMain } from 'electron'
import { buildSolverInput, checkSolverInput } from '../services/solverInputService'

/**
 * 引擎输入快照（M2）。
 * M2 只提供「组装 + 自检」，真正的求解（schedule:start/cancel/progress）在 M3 接上。
 */
export function registerSolverIpc(): void {
  ipcMain.handle('solver:buildInput', (_e, semesterId: number, weightProfileCode?: string) =>
    buildSolverInput(semesterId, weightProfileCode ?? 'balanced')
  )
  ipcMain.handle('solver:checkInput', (_e, semesterId: number, weightProfileCode?: string) =>
    checkSolverInput(semesterId, weightProfileCode ?? 'balanced')
  )
}
