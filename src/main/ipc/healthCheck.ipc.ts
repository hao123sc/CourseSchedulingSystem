import { ipcMain } from 'electron'
import { getDb } from '../db/connection'
import type { HealthCheckRow } from '@shared/types/ipc'

interface HealthCheckDbRow {
  id: number
  message: string
  created_at: string
}

function toRow(r: HealthCheckDbRow): HealthCheckRow {
  return { id: r.id, message: r.message, createdAt: r.created_at }
}

export function registerHealthCheckIpc(): void {
  ipcMain.handle('healthCheck:list', (): HealthCheckRow[] => {
    const rows = getDb()
      .prepare('SELECT id, message, created_at FROM health_check ORDER BY id DESC LIMIT 50')
      .all() as HealthCheckDbRow[]
    return rows.map(toRow)
  })

  ipcMain.handle('healthCheck:insert', (_evt, message: string): HealthCheckRow => {
    const stmt = getDb().prepare('INSERT INTO health_check (message) VALUES (?)')
    const info = stmt.run(message)
    const row = getDb()
      .prepare('SELECT id, message, created_at FROM health_check WHERE id = ?')
      .get(info.lastInsertRowid) as HealthCheckDbRow
    return toRow(row)
  })
}
