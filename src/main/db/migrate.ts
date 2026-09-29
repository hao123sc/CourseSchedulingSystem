import type Database from 'better-sqlite3'
import { MIGRATIONS, type Migration } from './migrations'

export interface MigrationResult {
  /** 本次实际执行了哪些迁移 */
  applied: string[]
  /** 版本号声称已应用、但结构断言不成立，因而被重新应用的（库被外部改动过的信号） */
  repaired: string[]
}

/**
 * 迁移执行器：按序应用未执行的迁移，每条在**单独事务**内执行——
 * SQL 全部成功才记录版本，任一语句失败整体回滚，不留「半张表 + 半份种子」。
 *
 * ⚠️ 只看 `schema_version` 是不够的。库可能被外部工具重建成低版本结构
 * （`npm run db:reset --hard` 用了过期的迁移清单、手工替换 data.db、从旧备份恢复），
 * 版本号却停在高位——于是迁移被永久跳过，结构再也补不回来。
 * 所以带 `verify` 结构断言的迁移**以断言为准**：断言不成立就重新应用一次。
 */
export function runMigrations(db: Database.Database): MigrationResult {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);`)

  const appliedRows = db.prepare('SELECT version FROM schema_version').all() as {
    version: number
  }[]
  const recorded = new Set(appliedRows.map((r) => r.version))
  const record = db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)')

  const result: MigrationResult = { applied: [], repaired: [] }

  for (const m of MIGRATIONS) {
    const inLedger = recorded.has(m.version)
    // 有结构断言的以实际结构为准，没有的只能信版本号
    const effective = m.verify ? safeVerify(db, m) : inLedger
    if (effective) {
      // 结构已经对了，但账上没记（例如库由更新的工具建好、版本表却被清过）——补记一笔
      if (!inLedger) record.run(m.version)
      continue
    }

    const isRepair = inLedger
    try {
      db.transaction(() => {
        db.exec(m.sql)
        record.run(m.version)
      })()
    } catch (err) {
      throw new Error(
        `数据库迁移 ${m.name} 执行失败：${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      )
    }

    if (m.verify && !safeVerify(db, m)) {
      throw new Error(`数据库迁移 ${m.name} 执行后结构断言仍不成立，请检查该迁移的 SQL`)
    }
    result.applied.push(m.name)
    if (isRepair) result.repaired.push(m.name)
  }

  return result
}

/** 断言本身不该让启动崩掉：表都还不存在时 PRAGMA 会抛，按「未生效」处理即可 */
function safeVerify(db: Database.Database, m: Migration): boolean {
  try {
    return m.verify?.(db) ?? false
  } catch {
    return false
  }
}
