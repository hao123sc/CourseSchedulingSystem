/* eslint-disable */
/**
 * 清空 / 重置数据库 —— `npm run db:reset`
 *
 * 三种力度（默认第一种）：
 *
 *   npm run db:reset                 清空「业务数据」，保留内置字典
 *                                    删：学校/学期/年级/班级/教师/教室/教学任务/规则/预排/约束组/课表结果…
 *                                    留：学段与作息、19 个学科、3 档权重档位（这些是迁移内置的，删了应用没法用）
 *
 *   npm run db:reset -- --all        连内置字典一起清空，再重放 002~004 的内置种子
 *                                    （等价于「学段作息、学科、权重档位都恢复出厂」）
 *
 *   npm run db:reset -- --hard       直接删掉 data.db（含 -wal/-shm）后重建
 *                                    （等价于「第一次安装」，最彻底；库文件损坏时也用它）
 *
 * 其它参数：
 *   --dry-run   只统计不删除，先看看会清掉多少行
 *   --yes / -y  跳过 3 秒倒计时（脚本化调用时用）
 *
 * 纯 Node 直跑（沙箱/CI 校验用，需显式指定库）：
 *   ZHIKEPAI_DB=/tmp/x.db node -r ./scripts/test/node-sqlite-driver.cjs scripts/reset-data.cjs --hard --yes
 */
const fs = require('fs')
const Database = require('better-sqlite3')
const base = require('./lib/demo-school.cjs')
const { runSeed, println, printSummary } = require('./lib/cli.cjs')

/** 业务数据表：清空顺序无所谓（执行前会关掉外键检查），但按依赖从下往上排更直观 */
const BUSINESS_TABLES = [
  'adjust_log',
  'lesson',
  'schedule_version',
  'virtual_class_source',
  'elective_combo',
  'group_member',
  'constraint_group',
  'fixed_lesson',
  'time_rule',
  'teaching_task',
  'subject_classroom',
  'room_coexist_rule',
  'teacher_subject',
  'teacher',
  'classroom',
  'klass',
  'grade',
  'semester',
  'school',
  'health_check'
]

/** 迁移内置的字典表：默认保留，--all / --hard 时才清 */
const BUILTIN_TABLES = ['time_slot', 'stage', 'subject', 'weight_profile']

const argv = process.argv.slice(2)
const has = (...flags) => flags.some((f) => argv.includes(f))
const MODE = has('--hard') ? 'hard' : has('--all') ? 'all' : 'data'
const DRY_RUN = has('--dry-run', '-n')
const SKIP_WAIT = has('--yes', '-y') || DRY_RUN

const MODE_LABEL = {
  data: '清空业务数据（保留学段作息 / 学科 / 权重档位）',
  all: '清空全部数据，内置字典恢复出厂',
  hard: '删除数据库文件后重建（等价于第一次安装）'
}

function tableExists(db, name) {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name)
}

function countRows(db, tables) {
  const out = {}
  for (const t of tables) {
    if (!tableExists(db, t)) continue
    out[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n
  }
  return out
}

/** 同步等待 seconds 秒，给人反悔的机会（脚本里没有 readline，直接用忙等最省事且跨平台） */
function countdown(seconds) {
  for (let i = seconds; i > 0; i--) {
    println(`  ${i} 秒后开始… （Ctrl+C 可中止）`)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
  }
}

function openDb(dbPath) {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

function main(app) {
  const dbPath = base.getDbPath(app)
  const exists = fs.existsSync(dbPath)

  println('')
  println('⚠️  数据清除')
  println(`   模式     ${MODE_LABEL[MODE]}`)
  println(`   数据库   ${dbPath}${exists ? '' : '（不存在，将新建）'}`)
  if (DRY_RUN) println('   —— --dry-run：只统计，不会真的删除 ——')

  // 先统计一次现状
  let before = {}
  if (exists) {
    const probe = openDb(dbPath)
    before = countRows(probe, [...BUSINESS_TABLES, ...BUILTIN_TABLES])
    probe.close()
  }
  const totalBefore = Object.values(before).reduce((a, b) => a + b, 0)
  println(`   现有数据 ${totalBefore} 行（${Object.keys(before).length} 张表）`)

  if (DRY_RUN) {
    printSummary(
      '将被清空的表（--dry-run）',
      Object.fromEntries(
        Object.entries(before)
          .filter(([t, n]) => n > 0 && (MODE !== 'data' || BUSINESS_TABLES.includes(t)))
          .map(([t, n]) => [t, `${n} 行`])
      ),
      '去掉 --dry-run 即真正执行。'
    )
    return
  }

  if (!SKIP_WAIT && totalBefore > 0) {
    println('')
    countdown(3)
  }

  if (MODE === 'hard') {
    for (const suffix of ['', '-wal', '-shm']) {
      const f = dbPath + suffix
      if (fs.existsSync(f)) fs.rmSync(f)
    }
    const db = openDb(dbPath)
    base.runMigrations(db)
    const after = countRows(db, [...BUSINESS_TABLES, ...BUILTIN_TABLES])
    db.close()
    report(dbPath, before, after)
    return
  }

  const db = openDb(dbPath)
  base.runMigrations(db) // 库可能是旧版本，先补齐结构再清
  const targets = MODE === 'all' ? [...BUSINESS_TABLES, ...BUILTIN_TABLES] : BUSINESS_TABLES

  db.pragma('foreign_keys = OFF')
  db.transaction(() => {
    for (const t of targets) {
      if (tableExists(db, t)) db.prepare(`DELETE FROM "${t}"`).run()
    }
    // 自增 id 归零，让重新录入的数据从 1 开始
    if (tableExists(db, 'sqlite_sequence')) {
      const list = targets.map(() => '?').join(',')
      db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${list})`).run(...targets)
    }
    if (MODE === 'all') {
      // 内置字典被清掉了，重放 002~004 的种子迁移把它们装回来
      db.prepare('DELETE FROM schema_version WHERE version IN (2,3,4)').run()
    }
  })()
  if (MODE === 'all') base.runMigrations(db)
  db.pragma('foreign_keys = ON')
  db.pragma('wal_checkpoint(TRUNCATE)')

  const after = countRows(db, [...BUSINESS_TABLES, ...BUILTIN_TABLES])
  db.close()
  report(dbPath, before, after)
}

function report(dbPath, before, after) {
  const changed = Object.keys(after)
    .filter((t) => (before[t] || 0) !== after[t])
    .sort()
  const kept = Object.entries(after).filter(([, n]) => n > 0)

  const summary = { 模式: MODE_LABEL[MODE] }
  if (MODE === 'hard') {
    summary['已清空'] = `整个库文件已删除并按全部 ${base.MIGRATIONS.length} 条迁移重建`
  } else {
    summary['已清空'] = changed.length
      ? changed.map((t) => `${t} ${before[t] || 0}→${after[t]}`).join('，')
      : '无（本来就是空的）'
  }
  if (MODE !== 'data') summary['内置字典'] = '已恢复出厂（学段作息 / 学科 / 权重档位）'
  summary['仍有数据'] = kept.length ? kept.map(([t, n]) => `${t} ${n}`).join('，') : '无'
  summary['数据库'] = dbPath

  printSummary(
    '清除完成',
    summary,
    '需要演示数据请跑 npm run seed:test（基础数据）或 npm run seed:m2（含教学任务与规则）。'
  )
}

runSeed(main)
