import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { IpcApi, ScheduleEventPayload } from '@shared/types/ipc'

/**
 * 类型化 IPC 客户端：每个通道都是 `invoke` 的薄封装，禁止渲染进程直接拿到 ipcRenderer。
 * 新增通道时先在 `@shared/types/ipc.ts` 的 IpcApi 声明签名，再在这里加一行转发。
 * 事件推送（Main → Renderer）单独暴露 onScheduleEvent，返回取消订阅函数。
 */
const zhikepaiApi: {
  [K in keyof IpcApi]: (...args: Parameters<IpcApi[K]>) => Promise<ReturnType<IpcApi[K]>>
} & {
  onScheduleEvent: (cb: (payload: ScheduleEventPayload) => void) => () => void
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
  'classroom:importExcel': () => ipcRenderer.invoke('classroom:importExcel'),

  // ---- 教学任务矩阵（M2） ----
  'task:list': (semesterId) => ipcRenderer.invoke('task:list', semesterId),
  'task:upsert': (p) => ipcRenderer.invoke('task:upsert', p),
  'task:delete': (id) => ipcRenderer.invoke('task:delete', id),
  'task:applyMatrix': (semesterId, patches) =>
    ipcRenderer.invoke('task:applyMatrix', semesterId, patches),
  'task:assignTeacher': (semesterId, cells, teacherId) =>
    ipcRenderer.invoke('task:assignTeacher', semesterId, cells, teacherId),
  'task:clear': (semesterId, gradeIds) => ipcRenderer.invoke('task:clear', semesterId, gradeIds),
  'task:applyCurriculum': (p) => ipcRenderer.invoke('task:applyCurriculum', p),
  'task:workloads': (semesterId) => ipcRenderer.invoke('task:workloads', semesterId),

  // ---- 四层时段规则（M2） ----
  'timeRule:listByScope': (semesterId, scope) =>
    ipcRenderer.invoke('timeRule:listByScope', semesterId, scope),
  'timeRule:listBySemester': (semesterId) =>
    ipcRenderer.invoke('timeRule:listBySemester', semesterId),
  'timeRule:setCells': (semesterId, scope, patches) =>
    ipcRenderer.invoke('timeRule:setCells', semesterId, scope, patches),
  'timeRule:clearScope': (semesterId, scope) =>
    ipcRenderer.invoke('timeRule:clearScope', semesterId, scope),
  'timeRule:copyScope': (semesterId, from, targets) =>
    ipcRenderer.invoke('timeRule:copyScope', semesterId, from, targets),
  'timeRule:summary': (semesterId) => ipcRenderer.invoke('timeRule:summary', semesterId),

  // ---- 学科规则（M2） ----
  'subjectRule:save': (patches) => ipcRenderer.invoke('subjectRule:save', patches),
  'subjectRule:listClassrooms': () => ipcRenderer.invoke('subjectRule:listClassrooms'),
  'subjectRule:setClassrooms': (subjectId, bindings) =>
    ipcRenderer.invoke('subjectRule:setClassrooms', subjectId, bindings),
  'subjectRule:applyConsecutive': (p) => ipcRenderer.invoke('subjectRule:applyConsecutive', p),

  // ---- 预排锁定（M2） ----
  'fixedLesson:list': (semesterId) => ipcRenderer.invoke('fixedLesson:list', semesterId),
  'fixedLesson:upsert': (p) => ipcRenderer.invoke('fixedLesson:upsert', p),
  'fixedLesson:delete': (id) => ipcRenderer.invoke('fixedLesson:delete', id),
  'fixedLesson:bulkCreate': (ps) => ipcRenderer.invoke('fixedLesson:bulkCreate', ps),
  'fixedLesson:conflicts': (semesterId) => ipcRenderer.invoke('fixedLesson:conflicts', semesterId),

  // ---- 约束组（M2） ----
  'constraintGroup:list': (semesterId) => ipcRenderer.invoke('constraintGroup:list', semesterId),
  'constraintGroup:upsert': (p) => ipcRenderer.invoke('constraintGroup:upsert', p),
  'constraintGroup:delete': (id) => ipcRenderer.invoke('constraintGroup:delete', id),

  // ---- 引擎输入快照（M2） ----
  'solver:buildInput': (semesterId, code) =>
    ipcRenderer.invoke('solver:buildInput', semesterId, code),
  'solver:checkInput': (semesterId, code) =>
    ipcRenderer.invoke('solver:checkInput', semesterId, code),

  // ---- 课表版本与排课执行（M3 后半段） ----
  'schedule:listVersions': (semesterId) => ipcRenderer.invoke('schedule:listVersions', semesterId),
  'schedule:deleteVersion': (id) => ipcRenderer.invoke('schedule:deleteVersion', id),
  'schedule:start': (semesterId, options) =>
    ipcRenderer.invoke('schedule:start', semesterId, options),
  'schedule:cancel': () => ipcRenderer.invoke('schedule:cancel'),
  'schedule:isRunning': () => ipcRenderer.invoke('schedule:isRunning'),

  // ---- 课表（M4/M7） ----
  'timetable:versionLessons': (versionId) =>
    ipcRenderer.invoke('timetable:versionLessons', versionId),
  'timetable:moveLesson': (payload) => ipcRenderer.invoke('timetable:moveLesson', payload),
  'timetable:exportExcel': (params) => ipcRenderer.invoke('timetable:exportExcel', params),

  // ---- 事件订阅（Main → Renderer） ----
  onScheduleEvent: (cb) => {
    const listener = (_e: unknown, payload: ScheduleEventPayload): void => cb(payload)
    ipcRenderer.on('schedule:event', listener)
    return () => ipcRenderer.removeListener('schedule:event', listener)
  }
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
