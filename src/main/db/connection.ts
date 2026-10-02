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
  const basePath = typeof app?.getAppPath === 'function' ? app.getAppPath() : process.cwd()
  const dir = app?.isPackaged ? app.getPath('userData') : join(basePath, '.local-data')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'data.db')
}

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = getDbPath()
  const conn = new Database(dbPath)
  try {
    // PRAGMA 配置见 docs/03 第 4 章
    conn.pragma('journal_mode = WAL')
    conn.pragma('synchronous = NORMAL')
    conn.pragma('foreign_keys = ON')
    conn.pragma('temp_store = MEMORY')
    conn.pragma('cache_size = -64000') // 64MB

    // M0 自检表：验证 better-sqlite3 原生模块在当前进程（含打包后）可正常读写
    conn.exec(`
      CREATE TABLE IF NOT EXISTS health_check (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
    `)

    // 应用建表与内置种子迁移（已生效的会跳过，结构漂移的会自愈重放）
    const { applied, repaired } = runMigrations(conn)
    if (applied.length > 0) {
      console.log(`[db] 已应用迁移：${applied.join(', ')}`)
    }
    if (repaired.length > 0) {
      // 版本号声称做过、结构却对不上——库被外部工具改过，值得在日志里留痕
      console.warn(
        `[db] 检测到结构与 schema_version 不一致，已重新应用：${repaired.join(', ')}。` +
          `常见原因：本 app 运行期间用 db:reset --hard 重建过数据库，或手工替换/还原过 data.db。`
      )
    }
  } catch (err) {
    // ⚠️ 迁移失败绝不能把连接留在模块变量里：
    // 否则后续每次 getDb() 都会直接复用这个「连得上但结构不全」的连接，
    // 迁移再也不会被尝试，表现为「app 能开、读也正常，一写就报 no such column」。
    conn.close()
    throw err
  }

  db = conn
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
