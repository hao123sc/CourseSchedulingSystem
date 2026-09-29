import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import Database from 'better-sqlite3'
import { runMigrations } from './migrate'

let db: Database.Database | null = null

/**
 * 数据库文件位置：
 * - 打包后：%APPDATA%/智课排/data.db（Windows）或对应平台 userData 目录
 * - 开发环境：仓库内 .local-data/dev.db（已 gitignore，不入库）
 *
 * M0 阶段只建一张自检表 `health_check`，正式 DDL 见 M1 的 migrations/001_init.sql。
 */
export function getDbPath(): string {
  const dir = app.isPackaged ? app.getPath('userData') : join(app.getAppPath(), '.local-data')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'data.db')
}

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = getDbPath()
  db = new Database(dbPath)
  // PRAGMA 配置见 docs/03 第 4 章
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('temp_store = MEMORY')
  db.pragma('cache_size = -64000') // 64MB

  // M0 自检表：验证 better-sqlite3 原生模块在当前进程（含打包后）可正常读写
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_check (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `)

  // M1：应用建表与内置种子迁移（幂等，已应用的版本会跳过）
  runMigrations(db)

  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
