import { ipcMain, app } from 'electron'
import { loadPreset } from '../services/presetService'
import { backupDatabase, restoreDatabase } from '../services/backupService'
import type { PresetCode, SystemPingResult } from '@shared/types/ipc'

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

  ipcMain.handle('seed:loadPreset', (_e, preset: PresetCode) => {
    return loadPreset(preset)
  })

  ipcMain.handle('system:backup', () => {
    return backupDatabase()
  })

  ipcMain.handle('system:restore', () => {
    return restoreDatabase()
  })
}

