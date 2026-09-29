import init001 from './001_init.sql?raw'
import seed002 from './002_seed_stages.sql?raw'
import seed003 from './003_seed_subjects.sql?raw'
import seed004 from './004_seed_weights.sql?raw'

export interface Migration {
  /** 单调递增的版本号，与文件名前缀一致，写入 schema_version */
  version: number
  name: string
  sql: string
}

/**
 * 迁移清单（顺序即执行顺序）。新增结构或种子一律追加新文件 + 新条目，
 * 不修改已发布的历史文件——保证任意旧库都能顺序升级到最新。
 */
export const MIGRATIONS: Migration[] = [
  { version: 1, name: '001_init', sql: init001 },
  { version: 2, name: '002_seed_stages', sql: seed002 },
  { version: 3, name: '003_seed_subjects', sql: seed003 },
  { version: 4, name: '004_seed_weights', sql: seed004 }
]
