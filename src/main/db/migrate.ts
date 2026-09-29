import type Database from 'better-sqlite3'
import { MIGRATIONS } from './migrations'

/**
 * 极简迁移执行器：读取 `schema_version` 已应用的版本，按序应用未执行的迁移。
 * 每个迁移在**单独事务**内执行——SQL 全部成功才记录版本，任一语句失败整体回滚，
 * 保证不会留下"半张表 + 半份种子"的中间态。
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);`)

  const appliedRows = db.prepare('SELECT version FROM schema_version').all() as {
    version: number
  }[]
  const applied = new Set(appliedRows.map((r) => r.version))
  const record = db.prepare('INSERT INTO schema_version (version) VALUES (?)')

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue
    const apply = db.transaction(() => {
      db.exec(m.sql)
      record.run(m.version)
    })
    apply()
  }
}
