import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { runMigrations } from './migrate'
import { MIGRATIONS, hasColumn } from './migrations'

/**
 * 迁移执行器的自愈行为。
 *
 * 用户真机上出过一次：`schema_version` 里记着 6，`fixed_lesson` 却没有 kind 列，
 * 于是每次启动都跳过 006，写入永远报 `no such column: kind`。
 * 成因是库被外部工具（旧版迁移清单的 `db:reset --hard`）重建成了低版本结构，
 * 而版本号停在高位。这组用例把那个状态构造出来，确认现在能自己修回去。
 *
 * 需要真实 sqlite 驱动：`npm run test:sqlite` 会用 node:sqlite 兼容壳跑；
 * 没有原生模块又没挂壳时自动 skip。
 */
const require = createRequire(import.meta.url)
let Database: new (path: string) => never
let nativeOk = false
try {
  Database = require('better-sqlite3')
  const probe = new (Database as unknown as new (p: string) => { close(): void })(':memory:')
  probe.close()
  nativeOk = true
} catch {
  nativeOk = false
}

const tmpDir = mkdtempSync(join(tmpdir(), 'zhikepai-migrate-test-'))
let seq = 0
type Db = {
  exec(sql: string): void
  prepare(sql: string): { all(...p: unknown[]): unknown[]; run(...p: unknown[]): unknown }
  pragma(s: string): unknown
  close(): void
}
const openDb = (): Db => {
  const Ctor = Database as unknown as new (p: string) => Db
  const db = new Ctor(join(tmpDir, `m-${seq++}.db`))
  db.pragma('foreign_keys = ON')
  return db
}
const versions = (db: Db): number[] =>
  (db.prepare('SELECT version FROM schema_version ORDER BY version').all() as { version: number }[])
    .map((r) => r.version)
    .sort((a, b) => a - b)

/** 只跑到 005 的库：模拟被过期迁移清单重建出来的结构 */
function buildLegacyDb(): Db {
  const db = openDb()
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));`
  )
  for (const m of MIGRATIONS) {
    if (m.version >= 6) break
    db.exec(m.sql)
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version)
  }
  return db
}

describe.skipIf(!nativeOk)('迁移执行器', () => {
  it('全新库：按序应用全部迁移', () => {
    const db = openDb()
    const r = runMigrations(db as never)
    expect(r.applied).toEqual(MIGRATIONS.map((m) => m.name))
    expect(r.repaired).toEqual([])
    expect(versions(db)).toEqual(MIGRATIONS.map((m) => m.version))
    expect(hasColumn(db, 'fixed_lesson', 'kind')).toBe(true)
    db.close()
  })

  it('已是最新的库：什么都不做', () => {
    const db = openDb()
    runMigrations(db as never)
    const again = runMigrations(db as never)
    expect(again.applied).toEqual([])
    expect(again.repaired).toEqual([])
    db.close()
  })

  it('旧库升级：只补做缺的那条，历史数据保留且回填默认值', () => {
    const db = buildLegacyDb()
    db.prepare(
      `INSERT INTO semester (id,name,start_date,end_date,is_current) VALUES (1,'s','2026-09-01','2027-01-10',1)`
    ).run()
    db.prepare(
      `INSERT INTO fixed_lesson (semester_id, class_id, slot_id, label)
                VALUES (1, NULL, 1, '历史班会')`
    ).run()

    const r = runMigrations(db as never)
    expect(r.applied).toEqual(['006_fixed_lesson_kind'])
    expect(r.repaired).toEqual([])
    expect(db.prepare('SELECT kind, label FROM fixed_lesson').all()).toEqual([
      { kind: 'lesson', label: '历史班会' }
    ])
    db.close()
  })

  it('结构漂移（版本号记了 6、列却不存在）：自愈重放，不再永久跳过', () => {
    const db = buildLegacyDb()
    // 谎报 006 已应用 —— 这正是用户真机上那个库的状态
    db.prepare('INSERT INTO schema_version (version) VALUES (6)').run()
    expect(hasColumn(db, 'fixed_lesson', 'kind')).toBe(false)

    const r = runMigrations(db as never)
    expect(r.repaired).toEqual(['006_fixed_lesson_kind'])
    expect(hasColumn(db, 'fixed_lesson', 'kind')).toBe(true)

    // 修好之后再启动不应反复重放
    expect(runMigrations(db as never).applied).toEqual([])
    db.close()
  })

  it('结构已生效但账上没记：补记版本号，不重复执行 ALTER', () => {
    const db = openDb()
    runMigrations(db as never)
    // 只抹掉 006 的记录，模拟「库由更新的工具建好、版本表被部分清理」
    db.prepare('DELETE FROM schema_version WHERE version = 6').run()
    expect(versions(db)).not.toContain(6)

    const r = runMigrations(db as never)
    // 断言认出结构已经对了 → 不重放（重放会撞 duplicate column），只补记账
    expect(r.applied).toEqual([])
    expect(versions(db)).toContain(6)
    expect(hasColumn(db, 'fixed_lesson', 'kind')).toBe(true)
    db.close()
  })

  it('没有结构断言的迁移仍然只认版本号（已知取舍，不是 bug）', () => {
    const db = openDb()
    runMigrations(db as never)
    db.exec('DELETE FROM schema_version')
    // 001 建表语句没有 IF NOT EXISTS，也没有 verify，账本一丢就会撞车。
    // 这是刻意的取舍：给每条迁移都写断言等于维护第二份 schema 定义，
    // 成本高于收益；真遇到版本表损坏，按 docs/08 的排障指引重建库。
    expect(() => runMigrations(db as never)).toThrow(/001_init 执行失败/)
    db.close()
  })
})
