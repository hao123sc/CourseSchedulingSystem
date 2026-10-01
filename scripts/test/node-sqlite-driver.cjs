/**
 * 测试专用：用 Node 22.5+ 内置的 `node:sqlite` 顶替 `better-sqlite3`。
 *
 * 为什么需要它
 * ────────────
 * `better-sqlite3` 是原生模块，需要本机编译工具链 + 下载预编译二进制。
 * 在没有外网或没有编译环境的机器（本项目的设计沙箱、部分 CI 容器）上装不上，
 * 于是所有数据层集成测试只能 `describe.skipIf(!nativeOk)` 跳过——
 * 等于新写的 Repository 用例根本没被执行过。
 *
 * 本文件提供一个**只替换驱动、不改产品代码**的兜底：
 * `vitest.sqlite.config.ts` 把 `better-sqlite3` 别名到这里，同时用 setupFiles
 * 劫持 `Module._load`（测试文件里的 `createRequire(...)('better-sqlite3')` 探针走的是这条路），
 * 于是真实的 `connection.ts` / `migrate.ts` / 全部 Repository / `solverInputService`
 * 都会在真实 SQL 引擎上跑，只是引擎换成了 Node 内置的那一个。
 *
 * ⚠️ 它是**兜底**不是等价物：
 *   - 生产运行时（Electron 主进程）用的仍然是 `better-sqlite3`；
 *   - 有原生模块的机器请直接 `npm test`，那条路径才是与生产完全一致的；
 *   - 两个引擎都是 SQLite，SQL 语义一致，差异只在 JS 侧 API 形状（本文件负责抹平）。
 *
 * 用法：`npm run test:sqlite`
 */

// node:sqlite 目前会打 ExperimentalWarning，每个 worker 打一次太吵；
// 必须在 require('node:sqlite') 之前装过滤器。
const emitWarning = process.emitWarning
process.emitWarning = function (warning, ...rest) {
  const type = typeof rest[0] === 'object' && rest[0] !== null ? rest[0].type : rest[0]
  if (type === 'ExperimentalWarning' && /SQLite/i.test(String(warning))) return
  return emitWarning.call(process, warning, ...rest)
}

let DatabaseSync
try {
  ;({ DatabaseSync } = require('node:sqlite'))
} catch (err) {
  throw new Error(
    `[test:sqlite] 当前 Node (${process.version}) 没有内置 node:sqlite，需要 Node >= 22.5。\n` +
      `请升级 Node，或在能编译 better-sqlite3 的机器上直接跑 npm test。\n` +
      `原始错误：${err.message}`
  )
}

/** better-sqlite3 接受 undefined / boolean，node:sqlite 不接受，这里统一成 SQLite 原生类型 */
function normalize(args) {
  return args.map((v) => {
    if (v === undefined) return null
    if (typeof v === 'boolean') return v ? 1 : 0
    return v
  })
}

class Statement {
  constructor(db, sql) {
    this.sql = sql
    this.stmt = db.prepare(sql)
  }

  /**
   * better-sqlite3 的命名参数：对象里多给的键会被忽略（只取 SQL 里出现过的 @key）。
   * node:sqlite 更严格，多一个键就抛 "Unknown named parameter"。
   * 产品代码里有 `run({ ...params, id })` 这类写法（在 better-sqlite3 下完全合法），
   * 所以这里按 SQL 文本过滤，行为对齐 better-sqlite3。
   */
  pickNamed(args) {
    const isNamedObject =
      args.length === 1 &&
      args[0] !== null &&
      typeof args[0] === 'object' &&
      !Array.isArray(args[0]) &&
      !Buffer.isBuffer(args[0])
    if (!isNamedObject) return args
    const picked = {}
    for (const key of Object.keys(args[0])) {
      if (new RegExp('[@:$]' + key + '\\b').test(this.sql)) picked[key] = args[0][key]
    }
    return [picked]
  }

  run(...args) {
    return this.stmt.run(...normalize(this.pickNamed(args)))
  }

  get(...args) {
    const row = this.stmt.get(...normalize(this.pickNamed(args)))
    // node:sqlite 返回的是 null 原型对象，测试里 toEqual/展开运算符需要普通对象
    return row === undefined || row === null ? undefined : { ...row }
  }

  all(...args) {
    return this.stmt.all(...normalize(this.pickNamed(args))).map((row) => ({ ...row }))
  }

  iterate(...args) {
    return this.all(...args)[Symbol.iterator]()
  }
}

class Database {
  constructor(filename) {
    this.db = new DatabaseSync(filename)
    this.db.exec('PRAGMA foreign_keys = ON')
    this.name = filename
    this.open = true
    this.inTransaction = false
  }

  prepare(sql) {
    return new Statement(this.db, sql)
  }

  exec(sql) {
    this.db.exec(sql)
    return this
  }

  /** WAL 等 PRAGMA 在内存库/某些编译选项下不可用，静默忽略即可——它们只影响性能，不影响语义 */
  pragma(source) {
    try {
      this.db.exec(`PRAGMA ${source}`)
    } catch {
      /* 忽略 */
    }
    return []
  }

  /** better-sqlite3 的 transaction() 返回一个可调用函数，且支持嵌套调用（内层复用外层事务） */
  transaction(fn) {
    const self = this
    return function transactionWrapper(...args) {
      if (self.inTransaction) return fn.apply(this, args)
      self.inTransaction = true
      self.db.exec('BEGIN')
      try {
        const result = fn.apply(this, args)
        self.db.exec('COMMIT')
        return result
      } catch (err) {
        self.db.exec('ROLLBACK')
        throw err
      } finally {
        self.inTransaction = false
      }
    }
  }

  close() {
    this.open = false
    this.db.close()
  }
}

// better-sqlite3 是 CJS 默认导出；ESM 侧 `import Database from 'better-sqlite3'` 也要能拿到
Database.default = Database
module.exports = Database
module.exports.default = Database

const electronStub = {
  dialog: {
    showSaveDialog: async () => ({ canceled: true, filePath: null }),
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  },
  BrowserWindow: {
    getFocusedWindow: () => null,
    getAllWindows: () => []
  },
  app: {
    getPath: () => '/tmp',
    whenReady: () => Promise.resolve(),
    exit: () => {}
  },
  ipcMain: {
    handle: () => {},
    on: () => {}
  }
}

// 测试文件里的探针走 createRequire(...)('better-sqlite3')，Vite 的 alias 管不到，这里补上
const Module = require('module')
if (!Module.__zhikepaiSqliteShim) {
  Module.__zhikepaiSqliteShim = true
  const load = Module._load
  Module._load = function (request, ...rest) {
    if (request === 'better-sqlite3') return Database
    if (request === 'electron') return electronStub
    return load.call(this, request, ...rest)
  }
}
