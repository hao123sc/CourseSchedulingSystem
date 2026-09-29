/**
 * 类型化 IPC 客户端的唯一入口。渲染层一律 `import { api } from '@renderer/lib/api'`，
 * 禁止直接摸 window.zhikepai / ipcRenderer。类型来自 preload 暴露的 ZhikepaiApi。
 */
export const api = window.zhikepai
