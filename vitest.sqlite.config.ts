import { resolve } from 'path'
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config'

/**
 * `npm run test:sqlite` —— 无法编译 better-sqlite3 原生模块时的兜底测试配置。
 *
 * 与 `npm test` 的唯一区别：把 sqlite 驱动换成 Node 内置的 `node:sqlite`
 * （见 scripts/test/node-sqlite-driver.cjs 的说明），从而让那些平时
 * `describe.skipIf(!nativeOk)` 跳过的数据层集成测试也能真实跑起来。
 *
 * 有原生模块的机器请优先用 `npm test`：那条路径与生产环境完全一致。
 */
const driver = resolve(__dirname, 'scripts/test/node-sqlite-driver.cjs')

console.log(
  '[test:sqlite] sqlite 驱动已替换为 Node 内置 node:sqlite（仅测试环境，产品代码不受影响）'
)

export default mergeConfig(
  base,
  defineConfig({
    resolve: {
      // 产品代码里的 import Database from 'better-sqlite3'
      alias: { 'better-sqlite3': driver }
    },
    test: {
      // 测试文件里的 createRequire(...)('better-sqlite3') 原生模块探针
      setupFiles: [driver],
      // 同一个临时库文件可能被多个测试文件用到，串行更稳
      fileParallelism: false
    }
  })
)
