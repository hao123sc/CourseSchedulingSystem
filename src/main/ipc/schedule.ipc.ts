import { ipcMain } from 'electron'
import { deleteVersion, listVersions } from '../services/scheduleResultService'
import { cancelSolveRun, isSolveRunning, startSolveRun } from '../services/solverRunService'
import type { ScheduleEventPayload, ScheduleStartOptions } from '@shared/types/ipc'

/**
 * 排课执行与课表版本（M3 后半段）。
 *
 * schedule:start 立即返回 runId；进度与结果经 `schedule:event` 推回渲染端。
 * 浏览器预览桥（scripts/dev/ipc-bridge.cjs）传入的 event 没有 sender，
 * 推送会被安全跳过，改由渲染端轮询 GET /api/schedule-events 拿同一批事件。
 */
export function registerScheduleIpc(): void {
  ipcMain.handle('schedule:listVersions', (_e, semesterId: number) => listVersions(semesterId))
  ipcMain.handle('schedule:deleteVersion', (_e, id: number) => {
    deleteVersion(id)
  })

  ipcMain.handle('schedule:start', (e, semesterId: number, options?: ScheduleStartOptions) => {
    const sender = e && (e as { sender?: { send?: (ch: string, p: unknown) => void } }).sender
    const emit = (payload: ScheduleEventPayload): void => {
      if (sender?.send) sender.send('schedule:event', payload)
    }
    return { runId: startSolveRun(semesterId, options ?? {}, emit) }
  })
  ipcMain.handle('schedule:cancel', () => cancelSolveRun())
  ipcMain.handle('schedule:isRunning', () => isSolveRunning())
}
