import init001 from './001_init.sql?raw'
import seed002 from './002_seed_stages.sql?raw'
import seed003 from './003_seed_subjects.sql?raw'
import seed004 from './004_seed_weights.sql?raw'
import m2005 from './005_m2_rules.sql?raw'
import m006 from './006_fixed_lesson_kind.sql?raw'
import m007 from './007_adjust_log_index.sql?raw'

export interface Migration {
  /** 单调递增的版本号，与文件名前缀一致，写入 schema_version */
  version: number
  name: string
  sql: string
  /**
   * 可选的**结构断言**：返回 true 表示这条迁移的效果已经实际存在于库里。
   *
   * 只看 schema_version 是不够的——库可能被外部工具（`npm run db:reset --hard`、
   * 手工替换 data.db、从旧备份恢复）重建成低版本结构，而版本号却停留在高位，
   * 于是迁移被永久跳过、结构再也补不回来（用户真机上就这么炸的：
   * 版本号有 6，`fixed_lesson` 却没有 kind 列）。
   *
   * 带 verify 的迁移由断言说了算：断言不成立就重新应用，
   * 因此它的 SQL **必须能在「断言不成立」的状态下安全重放**。
   */
  verify?: (db: MigrationDb) => boolean
}

/** 迁移执行器只需要这点能力，不绑定具体驱动（主进程用 better-sqlite3，脚本用 node:sqlite 壳） */
export interface MigrationDb {
  prepare(sql: string): { all(...params: unknown[]): unknown[] }
}

/** 表里是否已有某列 */
export function hasColumn(db: MigrationDb, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name?: string }[]
  return rows.some((r) => r.name === column)
}

export function hasIndex(db: MigrationDb, index: string): boolean {
  const rows = db.prepare(`PRAGMA index_list(adjust_log)`).all() as { name?: string }[]
  return rows.some((r) => r.name === index)
}

/**
 * 迁移清单（顺序即执行顺序）。新增结构或种子一律追加新文件 + 新条目，
 * 不修改已发布的历史文件——保证任意旧库都能顺序升级到最新。
 */
export const MIGRATIONS: Migration[] = [
  { version: 1, name: '001_init', sql: init001 },
  { version: 2, name: '002_seed_stages', sql: seed002 },
  { version: 3, name: '003_seed_subjects', sql: seed003 },
  { version: 4, name: '004_seed_weights', sql: seed004 },
  { version: 5, name: '005_m2_rules', sql: m2005 },
  {
    version: 6,
    name: '006_fixed_lesson_kind',
    sql: m006,
    // ALTER TABLE ADD COLUMN 不幂等，靠这个断言既做自愈触发器又做重放守卫
    verify: (db) => hasColumn(db, 'fixed_lesson', 'kind')
  },
  {
    version: 7,
    name: '007_adjust_log_index',
    sql: m007,
    verify: (db) => hasIndex(db, 'ix_adjust_log_version_created')
  }
]
