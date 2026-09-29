import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { IpcApi } from '@shared/types/ipc'

/**
 * 类型化 IPC 客户端：每个通道都是 `invoke` 的薄封装，禁止渲染进程直接拿到 ipcRenderer。
 * 新增通道时先在 `@shared/types/ipc.ts` 的 IpcApi 声明签名，再在这里加一行转发。
 */
const zhikepaiApi: {
  [K in keyof IpcApi]: (...args: Parameters<IpcApi[K]>) => Promise<ReturnType<IpcApi[K]>>
} = {
  'system:ping': () => ipcRenderer.invoke('system:ping'),
  'healthCheck:list': () => ipcRenderer.invoke('healthCheck:list'),
  'healthCheck:insert': (message: string) => ipcRenderer.invoke('healthCheck:insert', message),

  // ---- 学校 / 学期 ----
  'school:get': () => ipcRenderer.invoke('school:get'),
  'school:save': (p) => ipcRenderer.invoke('school:save', p),
  'semester:list': () => ipcRenderer.invoke('semester:list'),
  'semester:getCurrent': () => ipcRenderer.invoke('semester:getCurrent'),
  'semester:upsert': (p) => ipcRenderer.invoke('semester:upsert', p),
  'semester:delete': (id) => ipcRenderer.invoke('semester:delete', id),
  'semester:setCurrent': (id) => ipcRenderer.invoke('semester:setCurrent', id),

  // ---- 学段 / 作息 ----
  'stage:list': () => ipcRenderer.invoke('stage:list'),
  'stage:upsert': (p) => ipcRenderer.invoke('stage:upsert', p),
  'stage:delete': (id) => ipcRenderer.invoke('stage:delete', id),
  'timeSlot:listByStage': (stageId) => ipcRenderer.invoke('timeSlot:listByStage', stageId),
  'timeSlot:replaceForStage': (stageId, periods) =>
    ipcRenderer.invoke('timeSlot:replaceForStage', stageId, periods),

  // ---- 年级 / 班级 ----
  'grade:list': (semesterId) => ipcRenderer.invoke('grade:list', semesterId),
  'grade:upsert': (p) => ipcRenderer.invoke('grade:upsert', p),
  'grade:delete': (id) => ipcRenderer.invoke('grade:delete', id),
  'class:listByGrade': (gradeId) => ipcRenderer.invoke('class:listByGrade', gradeId),
  'class:listBySemester': (semesterId) => ipcRenderer.invoke('class:listBySemester', semesterId),
  'class:upsert': (p) => ipcRenderer.invoke('class:upsert', p),
  'class:delete': (id) => ipcRenderer.invoke('class:delete', id),
  'class:batchCreate': (p) => ipcRenderer.invoke('class:batchCreate', p),

  // ---- 学科 ----
  'subject:list': () => ipcRenderer.invoke('subject:list'),
  'subject:upsert': (p) => ipcRenderer.invoke('subject:upsert', p),
  'subject:delete': (id) => ipcRenderer.invoke('subject:delete', id),

  // ---- 教师 ----
  'teacher:list': () => ipcRenderer.invoke('teacher:list'),
  'teacher:upsert': (p) => ipcRenderer.invoke('teacher:upsert', p),
  'teacher:delete': (id) => ipcRenderer.invoke('teacher:delete', id),

  // ---- 教室 ----
  'classroom:list': () => ipcRenderer.invoke('classroom:list'),
  'classroom:upsert': (p) => ipcRenderer.invoke('classroom:upsert', p),
  'classroom:delete': (id) => ipcRenderer.invoke('classroom:delete', id),

  // ---- 风格权重档位 ----
  'weightProfile:list': () => ipcRenderer.invoke('weightProfile:list'),

  // ---- Excel 导入 / 导出 ----
  'teacher:exportExcel': () => ipcRenderer.invoke('teacher:exportExcel'),
  'teacher:importExcel': () => ipcRenderer.invoke('teacher:importExcel'),
  'class:exportExcel': (semesterId) => ipcRenderer.invoke('class:exportExcel', semesterId),
  'class:importExcel': (semesterId) => ipcRenderer.invoke('class:importExcel', semesterId),
  'classroom:exportExcel': () => ipcRenderer.invoke('classroom:exportExcel'),
  'classroom:importExcel': () => ipcRenderer.invoke('classroom:importExcel')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('zhikepai', zhikepaiApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // 仅在 contextIsolation 关闭的调试场景下兜底，正式版本恒为 true
  window.electron = electronAPI
  window.zhikepai = zhikepaiApi
}

export type ZhikepaiApi = typeof zhikepaiApi
