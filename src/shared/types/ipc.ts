/**
 * 类型化 IPC 通道声明。
 *
 * 约定：通道名为 `域:动作`；每个通道在这里声明一次「入参 → 返回值」的函数签名，
 * preload 与 main 两端都以此为唯一事实来源，禁止裸用 `ipcRenderer.invoke('xxx')` 字符串。
 *
 * M0 阶段只落地了骨架自检所需的通道（system:*、healthCheck:*），
 * M1 补齐基础数据域（school / semester / stage / timeSlot / grade / class /
 * subject / teacher / classroom / weightProfile / excel），
 * 其余域（matrix / rule / schedule / timetable / report ...）随 M2~M7 逐步补齐。
 */

import type {
  Classroom,
  ClassroomInput,
  ClassBatchInput,
  ExcelExportResult,
  ExcelImportResult,
  Grade,
  GradeInput,
  Klass,
  KlassInput,
  PeriodTemplate,
  School,
  SchoolInput,
  Semester,
  SemesterInput,
  Stage,
  StageInput,
  Subject,
  SubjectInput,
  Teacher,
  TeacherInput,
  TimeSlot,
  WeightProfile
} from './entities'

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

  // ---- 学校 / 学期（M1） ----
  'school:get': () => School | null
  'school:save': (payload: SchoolInput) => School
  'semester:list': () => Semester[]
  'semester:getCurrent': () => Semester | null
  'semester:upsert': (payload: SemesterInput) => Semester
  'semester:delete': (id: number) => void
  'semester:setCurrent': (id: number) => void

  // ---- 学段 / 作息（M1） ----
  'stage:list': () => Stage[]
  'stage:upsert': (payload: StageInput) => Stage
  'stage:delete': (id: number) => void
  'timeSlot:listByStage': (stageId: number) => TimeSlot[]
  /** 用整套「节次模板 × 天数」覆盖某学段的全部作息（作息编辑器保存） */
  'timeSlot:replaceForStage': (stageId: number, periods: PeriodTemplate[]) => TimeSlot[]

  // ---- 年级 / 班级（M1） ----
  'grade:list': (semesterId: number) => Grade[]
  'grade:upsert': (payload: GradeInput) => Grade
  'grade:delete': (id: number) => void
  'class:listByGrade': (gradeId: number) => Klass[]
  'class:listBySemester': (semesterId: number) => Klass[]
  'class:upsert': (payload: KlassInput) => Klass
  'class:delete': (id: number) => void
  'class:batchCreate': (payload: ClassBatchInput) => Klass[]

  // ---- 学科（M1） ----
  'subject:list': () => Subject[]
  'subject:upsert': (payload: SubjectInput) => Subject
  'subject:delete': (id: number) => void

  // ---- 教师（M1） ----
  'teacher:list': () => Teacher[]
  'teacher:upsert': (payload: TeacherInput) => Teacher
  'teacher:delete': (id: number) => void

  // ---- 教室（M1） ----
  'classroom:list': () => Classroom[]
  'classroom:upsert': (payload: ClassroomInput) => Classroom
  'classroom:delete': (id: number) => void

  // ---- 风格权重档位（M1，只读） ----
  'weightProfile:list': () => WeightProfile[]

  // ---- Excel 导入 / 导出（M1；教师 / 班级 / 教室） ----
  'teacher:exportExcel': () => ExcelExportResult
  'teacher:importExcel': () => ExcelImportResult
  'class:exportExcel': (semesterId: number) => ExcelExportResult
  'class:importExcel': (semesterId: number) => ExcelImportResult
  'classroom:exportExcel': () => ExcelExportResult
  'classroom:importExcel': () => ExcelImportResult

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
