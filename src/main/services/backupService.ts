import { dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import { getDb } from '../db/connection'

function focused(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

export async function backupDatabase(): Promise<{ canceled: boolean; filePath: string | null }> {
  const win = focused()
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const defaultPath = `zhikepai_backup_${dateStr}.db`

  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    title: '备份数据库',
    defaultPath,
    filters: [{ name: 'SQLite 数据库文件', extensions: ['db', 'sqlite'] }]
  })

  if (canceled || !filePath) return { canceled: true, filePath: null }

  const db = getDb()
  // 使用 SQLite 内置 VACUUM INTO 进行安全热备份
  const escapedPath = filePath.replace(/'/g, "''")
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  db.prepare(`VACUUM INTO '${escapedPath}'`).run()

  return { canceled: false, filePath }
}

export async function restoreDatabase(): Promise<{ canceled: boolean; success: boolean }> {
  const win = focused()
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    title: '恢复数据库备份',
    properties: ['openFile'],
    filters: [{ name: 'SQLite 数据库文件', extensions: ['db', 'sqlite'] }]
  })

  if (canceled || filePaths.length === 0) return { canceled: true, success: false }

  const sourceFile = filePaths[0]
  // 基础校验：检查文件大小
  const stats = fs.statSync(sourceFile)
  if (stats.size < 1024) {
    throw new Error('所选文件不是有效的智课排数据库备份文件')
  }

  const db = getDb()
  // 将现有数据用备份文件替换（需重建或恢复表数据）
  db.prepare(`ATTACH DATABASE '${sourceFile.replace(/'/g, "''")}' AS backup_db`).run()
  try {
    const tables = [
      'adjust_log', 'lesson', 'schedule_version', 'fixed_lesson',
      'time_rule', 'subject_classroom', 'constraint_group', 'teaching_task',
      'klass', 'grade', 'classroom', 'teacher', 'semester', 'stage', 'school'
    ]
    const tx = db.transaction(() => {
      for (const t of tables) {
        try {
          db.prepare(`DELETE FROM ${t}`).run()
          db.prepare(`INSERT OR REPLACE INTO ${t} SELECT * FROM backup_db.${t}`).run()
        } catch {
          /* 表不存在时忽略 */
        }
      }
    })
    tx()
  } finally {
    try {
      db.prepare(`DETACH DATABASE backup_db`).run()
    } catch {
      /* ignore */
    }
  }

  return { canceled: false, success: true }
}
