/* eslint-disable */
/**
 * 浏览器预览模式的后端桥（仅开发用，不参与打包）。
 *
 * 做法：用 esbuild 把**真实的**主进程 IPC 层（src/main/ipc/index.ts → 各 repository →
 * solverInputService）打成一个 CJS bundle，过程中只替换两样东西：
 *   - `electron`      → 桩：ipcMain.handle 把 handler 收进 Map；app.getPath 指向临时目录；
 *                        dialog 直接返回"已取消"（Excel 导入导出在浏览器里没有意义）
 *   - `better-sqlite3`→ scripts/test/node-sqlite-driver.cjs（Node 内置 node:sqlite 兼容壳）
 *
 * 于是 `POST /api/ipc {channel, args}` 走的是与 Electron 里**完全相同的**那一份业务代码，
 * 数据也是真实的 .local-data/data.db，只是驱动和外壳换了。
 *
 * 用途：沙箱 / CI 里没有 Electron 运行时，但需要看 UI、验证布局与交互。
 */
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..', '..')

async function buildIpcBundle() {
  const esbuild = require('esbuild')
  // 必须落在项目内，否则 bundle 里对 exceljs 等 external 依赖的 require 解析不到 node_modules
  const cacheDir = path.join(ROOT, 'node_modules', '.cache', 'zhikepai')
  fs.mkdirSync(cacheDir, { recursive: true })
  const outfile = path.join(cacheDir, 'ipc-bridge.cjs')

  /** 把 electron 换成桩：收集 handler、给出 app 路径、屏蔽 dialog */
  const electronStub = `
    const path = require('path')
    const handlers = new Map()
    const ROOT = ${JSON.stringify(ROOT)}
    exports.ipcMain = {
      handle: (channel, fn) => handlers.set(channel, fn),
      removeHandler: (channel) => handlers.delete(channel)
    }
    exports.app = {
      isPackaged: false,
      getAppPath: () => ROOT,
      getPath: () => path.join(ROOT, '.local-data'),
      getVersion: () => 'preview'
    }
    exports.BrowserWindow = { getAllWindows: () => [], getFocusedWindow: () => null }
    exports.dialog = {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true, filePath: undefined })
    }
    exports.shell = { openExternal: async () => {}, showItemInFolder: () => {} }
    globalThis.__zhikepaiIpcHandlers = handlers
  `

  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/main/ipc/index.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    logLevel: 'warning',
    tsconfig: path.join(ROOT, 'tsconfig.node.json'),
    external: ['exceljs'],
    loader: { '.sql': 'text' },
    plugins: [
      {
        name: 'zhikepai-preview-stubs',
        setup(build) {
          build.onResolve({ filter: /^electron$/ }, () => ({
            path: 'electron',
            namespace: 'stub-electron'
          }))
          build.onLoad({ filter: /.*/, namespace: 'stub-electron' }, () => ({
            contents: electronStub,
            loader: 'js'
          }))
          build.onResolve({ filter: /^better-sqlite3$/ }, () => ({
            path: path.join(ROOT, 'scripts/test/node-sqlite-driver.cjs')
          }))
        }
      }
    ]
  })

  delete require.cache[require.resolve(outfile)]
  const mod = require(outfile)
  mod.registerAllIpc()
  return globalThis.__zhikepaiIpcHandlers
}

let handlersPromise = null
function getHandlers() {
  if (!handlersPromise) handlersPromise = buildIpcBundle()
  return handlersPromise
}

/** 读请求体（限制 8MB，够矩阵批量写入用） */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > 8 * 1024 * 1024) reject(new Error('请求体过大'))
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * 返回一个 connect 风格中间件，挂到 vite dev server 上即可（同端口，无需跨域）。
 */
function createIpcMiddleware() {
  return async function ipcMiddleware(req, res, next) {
    if (!req.url || !req.url.startsWith('/api/ipc')) return next()
    if (req.method !== 'POST') {
      res.statusCode = 405
      return res.end('only POST')
    }
    try {
      const { channel, args = [] } = JSON.parse((await readBody(req)) || '{}')
      const handlers = await getHandlers()
      const handler = handlers.get(channel)
      if (!handler) {
        res.statusCode = 404
        res.setHeader('content-type', 'application/json')
        return res.end(JSON.stringify({ error: `未注册的 IPC 通道：${channel}` }))
      }
      const result = await handler({}, ...args)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ result: result === undefined ? null : result }))
    } catch (err) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: err && err.message ? err.message : String(err) }))
    }
  }
}

module.exports = { createIpcMiddleware, getHandlers }
