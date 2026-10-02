/**
 * 种子脚本的公共外壳。解决三件与「怎么跑」有关的事，业务逻辑一概不碰：
 *
 *   1. 退出   —— electron 不开窗口也不会自己结束，跑完必须显式 app.exit()，
 *                否则终端一直挂着只能强杀（本文件存在的首要原因）。
 *   2. 编码   —— Windows 控制台默认代码页 936(GBK)，直接输出 UTF-8 中文会变乱码，
 *                这里在打印前把控制台切到 65001(UTF-8)。
 *   3. 启动方式 —— 正式用法是 `npm run seed:test` / `npm run seed:m2`（由 electron 启动，
 *                匹配 better-sqlite3 的原生 ABI）；但只要显式给了 ZHIKEPAI_DB，
 *                也允许在纯 Node 下直跑，供沙箱/CI 校验种子逻辑（见 docs/08 §8）。
 */
const fs = require('fs')
const { execSync } = require('child_process')

/** Windows 控制台切 UTF-8。没有控制台（被重定向到管道/文件）时静默跳过 */
function enableUtf8Console() {
  if (process.platform !== 'win32') return
  try {
    execSync('chcp 65001', { stdio: 'ignore', windowsHide: true })
  } catch {
    /* 拿不到控制台就算了，不影响落库 */
  }
}

/**
 * 同步输出。app.exit() 会立刻终止进程，而 Windows 上 stdout 是管道时 console.log 是异步的，
 * 缓冲区里没来得及刷出去的内容会被直接丢掉——所以摘要一律走 writeSync。
 */
function println(line = '') {
  fs.writeSync(1, `${line}\n`)
}

/** 中文占 2 列，用 padEnd 对不齐；按显示宽度补空格 */
function displayWidth(str) {
  let w = 0
  for (const ch of String(str)) {
    const code = ch.codePointAt(0)
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    w += wide ? 2 : 1
  }
  return w
}

function padLabel(label, width) {
  return `${label}${' '.repeat(Math.max(0, width - displayWidth(label)))}`
}

/** 打印 { 标签: 值 } 摘要表，标签列按显示宽度对齐 */
function printSummary(title, summary, tail) {
  const width = Math.max(...Object.keys(summary).map(displayWidth)) + 2
  println()
  println(`===== ${title} =====`)
  for (const [k, v] of Object.entries(summary)) println(`  ${padLabel(k, width)}${v}`)
  if (tail) {
    println()
    println(tail)
  }
}

/** 取 electron 的 app；纯 Node 模式（必须给 ZHIKEPAI_DB）返回 null */
function resolveApp() {
  let app = null
  let reason = ''
  try {
    ;({ app } = require('electron'))
  } catch (err) {
    reason = err && err.message ? err.message : String(err)
  }
  if (app) return app
  if (process.env.ZHIKEPAI_DB) return null
  throw new Error(
    '请用 npm run seed:test / npm run seed:m2 启动（需要 electron）；\n' +
      '  若要在纯 Node 下运行，请通过环境变量 ZHIKEPAI_DB 指定数据库路径。' +
      (reason ? `\n  （electron 不可用：${reason.split('\n')[0]}）` : '')
  )
}

function exit(app, code) {
  if (app && typeof app.exit === 'function') app.exit(code)
  else process.exit(code)
}

/**
 * 种子脚本入口：`runSeed((app) => { ... })`
 * electron 模式下等 app ready 再跑（与 app.getPath('userData') 的取值时机保持一致）。
 */
function runSeed(main) {
  enableUtf8Console()
  let app = null
  try {
    app = resolveApp()
  } catch (err) {
    println(`\n[种子脚本] 启动失败：${err && err.message ? err.message : err}`)
    process.exit(1)
  }

  const run = () => {
    try {
      main(app)
      exit(app, 0)
    } catch (err) {
      println(`\n[种子脚本] 执行失败：${err && err.stack ? err.stack : err}`)
      exit(app, 1)
    }
  }

  if (app && typeof app.whenReady === 'function') app.whenReady().then(run)
  else run()
}

module.exports = { runSeed, println, printSummary, enableUtf8Console, displayWidth }
