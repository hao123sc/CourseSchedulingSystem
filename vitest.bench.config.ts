import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/**
 * `npm run bench` —— 引擎基准（docs/08 §7：M3 之后每次改引擎都必须跑）。
 *
 * 与 `npm test` 的区别：
 *  · **只**收 `src/solver/bench/*.bench.ts`，不与单测混跑（单测要快，基准要真实规模）。
 *    这里故意不 mergeConfig(base)：vitest 合并会把 include 数组接起来，
 *    结果把全部单测也拖进来跑，所以整份配置独立写。
 *  · sqlite 驱动换成 Node 内置 `node:sqlite`（沙箱编不了 better-sqlite3 原生模块），
 *    产品代码、迁移、Repository、种子逻辑全都照常执行
 *  · 超时放宽到 10 分钟：240 班算例的时间预算本身就有 90s
 */
const driver = resolve(__dirname, 'scripts/test/node-sqlite-driver.cjs')

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@solver': resolve(__dirname, 'src/solver'),
      'better-sqlite3': driver
    }
  },
  test: {
    environment: 'node',
    include: ['src/solver/bench/*.bench.ts'],
    setupFiles: [driver],
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000
  }
})
