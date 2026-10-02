import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * M0 关键验收测试：验证 better-sqlite3 原生模块在「与生产环境完全相同的代码路径」下
 * （src/main/db/connection.ts 的真实实现，而非另写的 smoke script）可正常建库、建表、读写。
 *
 * 通过 mock `electron` 模块的 app.getPath/isPackaged，让这段主进程专用代码可以在纯 Node/Vitest
 * 环境下跑通——这是本沙箱网络策略下能做到的最贴近真实运行路径的自动化验证；
 * Electron 窗口内的最终手工验证仍需在具备完整外网访问的机器上补做（见 PROGRESS.md 风险记录）。
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'zhikepai-db-test-'))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => tmpDir,
    getPath: () => tmpDir
  }
}))

describe('main/db/connection · better-sqlite3 读写自检', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('getDb() 建库建表，并可插入/查询 health_check', async () => {
    const { getDb, closeDb } = await import('./connection')
    const db = getDb()

    const insert = db.prepare('INSERT INTO health_check (message) VALUES (?)')
    const info = insert.run('M0 自检：better-sqlite3 读写通过')

    const row = db
      .prepare('SELECT id, message FROM health_check WHERE id = ?')
      .get(info.lastInsertRowid) as { id: number; message: string }

    expect(row.message).toBe('M0 自检：better-sqlite3 读写通过')

    const rows = db.prepare('SELECT COUNT(*) as cnt FROM health_check').get() as { cnt: number }
    expect(rows.cnt).toBeGreaterThanOrEqual(1)

    closeDb()
  })
})
