/**
 * 类型化 IPC 通道声明。
 *
 * 约定：通道名为 `域:动作`；每个通道在这里声明一次「入参 → 返回值」的函数签名，
 * preload 与 main 两端都以此为唯一事实来源，禁止裸用 `ipcRenderer.invoke('xxx')` 字符串。
 *
 * M0 阶段只落地了骨架自检所需的通道（system:*、healthCheck:*），
 * 其余域（grade / matrix / rule / schedule / timetable / report / export / seed ...）
 * 将随 M1~M7 逐步补齐，先在此列出接口占位以固定命名规范。
 */

/** M0：系统自检，验证主进程存活与版本信息可读 */
export interface SystemPingResult {
  ok: true
  appVersion: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  platform: NodeJS.Platform
}

/** M0：数据库健康检查测试表的一行记录 */
export interface HealthCheckRow {
  id: number
  message: string
  createdAt: string
}

/**
 * IPC 通道总表。key 为通道名，value 为 `(参数) => 返回值` 的函数类型。
 * 使用 `invoke` 语义（Promise 化），事件推送另见 IpcEvents。
 */
export interface IpcApi {
  // ---- 系统 / 自检（M0 已实现） ----
  'system:ping': () => SystemPingResult
  'healthCheck:list': () => HealthCheckRow[]
  'healthCheck:insert': (message: string) => HealthCheckRow

  // ---- 基础数据（M1 占位，尚未实现） ----
  // 'grade:list': (semesterId: number) => Grade[]
  // 'grade:upsert': (payload: GradeInput) => Grade
  // 'class:batchCreate': (p: { gradeId: number; count: number; namePattern: string }) => Klass[]

  // ---- 教学任务 / 规则（M2 占位） ----
  // 'matrix:get': (semesterId: number) => TeachingMatrix
  // 'matrix:set': (cells: MatrixCell[]) => void
  // 'rule:getTimeGrid': (scope: unknown) => unknown
  // 'rule:setTimeGrid': (scope: unknown, grid: unknown) => void

  // ---- 排课（M3/M5 占位） ----
  // 'schedule:selfCheck': (semesterId: number) => unknown
  // 'schedule:start': (p: unknown) => { taskId: string }
  // 'schedule:cancel': (taskId: string) => void

  // ---- 课表 / 报告 / 导出 / 种子数据（M4/M7/M8 占位） ----
  // 'timetable:byClass': (classId: number) => unknown
  // 'report:health': (versionId: number) => unknown
  // 'export:excel': (p: unknown) => { filePath: string }
  // 'seed:load': (preset: 'primary' | 'junior' | 'senior') => void
}

export type IpcChannel = keyof IpcApi

/** Main → Renderer 的事件推送通道（M3 起使用），先占位固定命名 */
export type IpcEvents = {
  // 'schedule:progress': (p: unknown) => void
  // 'schedule:done': (p: unknown) => void
  // 'schedule:failed': (p: unknown) => void
  readonly __placeholder__?: never
}

export type IpcEventChannel = keyof IpcEvents
