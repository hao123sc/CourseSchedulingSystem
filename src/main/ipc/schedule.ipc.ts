import { ipcMain } from 'electron'
import { deleteVersion, listVersions } from '../services/scheduleResultService'

/**
 * 课表版本（M3 后半段）。
 * `schedule:start` / `schedule:cancel` 与进度事件在 Worker 封装（solverRunService）里接上。
 */
export function registerScheduleIpc(): void {
  ipcMain.handle('schedule:listVersions', (_e, semesterId: number) => listVersions(semesterId))
  ipcMain.handle('schedule:deleteVersion', (_e, id: number) => {
    deleteVersion(id)
  })
}
