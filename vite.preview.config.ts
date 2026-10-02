import { resolve } from 'path'
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createIpcMiddleware } = require('./scripts/dev/ipc-bridge.cjs')

/**
 * `npm run preview:ui` —— 在**普通浏览器**里预览渲染层（无需 Electron 运行时）。
 *
 * 渲染层代码一行不改：`src/renderer/src/lib/api.ts` 发现 window.zhikepai 不存在时，
 * 会退回一个把调用转成 `POST /api/ipc` 的桥；这里的中间件再把它交给**真实的**主进程
 * IPC handler（见 scripts/dev/ipc-bridge.cjs），读写的是真实的 .local-data/data.db。
 *
 * 适用：沙箱 / CI 里看 UI、验证响应式布局与交互。
 * 局限：Excel 导入导出（要系统文件对话框）在预览模式下会返回"已取消"；
 *      最终验收仍以 `npm run dev` 的 Electron 窗口为准。
 */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@solver': resolve(__dirname, 'src/solver')
    }
  },
  plugins: [
    react(),
    {
      name: 'zhikepai-ipc-bridge',
      configureServer(server) {
        server.middlewares.use(createIpcMiddleware())
      },
      // index.html 里的 CSP（script-src 'self'）是给 Electron 生产环境用的，
      // 它会挡掉 vite dev 注入的内联 HMR 脚本；预览模式下去掉，不影响产品文件。
      transformIndexHtml(html) {
        return html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>\s*/i, '')
      }
    } as PluginOption
  ],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: false,
    // 预览可能经由隧道域名访问（沙箱/远程开发），这里放开 host 校验
    allowedHosts: true
  }
})
