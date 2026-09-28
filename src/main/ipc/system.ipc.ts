import { ipcMain, app } from 'electron'
import type { SystemPingResult } from '@shared/types/ipc'

export function registerSystemIpc(): void {
  ipcMain.handle('system:ping', (): SystemPingResult => {
    return {
      ok: true,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? 'unknown',
      chromeVersion: process.versions.chrome ?? 'unknown',
      nodeVersion: process.versions.node ?? 'unknown',
      platform: process.platform
    }
  })
}
