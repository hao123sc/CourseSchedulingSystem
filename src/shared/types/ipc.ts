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
  ConstraintGroup,
  ConstraintGroupInput,
  CurriculumApplyResult,
  ExcelExportResult,
  ExcelImportResult,
  FixedLesson,
  FixedLessonInput,
  Grade,
  GradeInput,
  Klass,
  KlassInput,
  MatrixCellPatch,
  PeriodTemplate,
  RuleScopeRef,
  RuleScopeSummary,
  School,
  SchoolInput,
  Semester,
  SemesterInput,
  ScheduleVersion,
  Stage,
  StageInput,
  Subject,
  SubjectClassroom,
  SubjectInput,
  SubjectRulePatch,
  Teacher,
  TeacherInput,
  TeacherWorkload,
  TeachingTask,
  TeachingTaskInput,
  TimeRule,
  TimeRulePatch,
  TimeSlot,
  WeightProfile
} from './entities'
import type { FixedLessonConflict } from '../constraints'
import type { SolverInput } from '../../solver/model/types'
import type { SolverInputReport } from '../../solver/model/validate'
import type { Diagnosis } from '../../solver/core/diagnosis'
import type { HardViolation, PlacedLesson } from '../../solver/model/solution'
import type { SolvePhase } from '../../solver/solve'

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

  // ---- 教学任务矩阵（M2） ----
  'task:list': (semesterId: number) => TeachingTask[]
  'task:upsert': (payload: TeachingTaskInput) => TeachingTask
  'task:delete': (id: number) => void
  /** 矩阵批量提交：weeklyPeriods=0 删除、teacherId=undefined 保留原值 */
  'task:applyMatrix': (semesterId: number, patches: MatrixCellPatch[]) => TeachingTask[]
  /** 教师指派器「应用到整列/选区」 */
  'task:assignTeacher': (
    semesterId: number,
    cells: { classId: number; subjectId: number }[],
    teacherId: number | null
  ) => TeachingTask[]
  'task:clear': (semesterId: number, gradeIds?: number[]) => number
  /** 国家课程标准课时方案一键套用 */
  'task:applyCurriculum': (payload: {
    semesterId: number
    planCode: string
    gradeIds: number[]
    overwrite: boolean
    entries?: { subject: string; periods: number }[]
  }) => CurriculumApplyResult
  /** 教师工作量看板 */
  'task:workloads': (semesterId: number) => TeacherWorkload[]

  // ---- 四层时段规则（M2，决策 D4） ----
  'timeRule:listByScope': (semesterId: number, scope: RuleScopeRef) => TimeRule[]
  'timeRule:listBySemester': (semesterId: number) => TimeRule[]
  'timeRule:setCells': (
    semesterId: number,
    scope: RuleScopeRef,
    patches: TimeRulePatch[]
  ) => TimeRule[]
  'timeRule:clearScope': (semesterId: number, scope: RuleScopeRef) => number
  'timeRule:copyScope': (semesterId: number, from: RuleScopeRef, targets: RuleScopeRef[]) => number
  'timeRule:summary': (semesterId: number) => RuleScopeSummary[]

  // ---- 学科规则（M2） ----
  'subjectRule:save': (patches: SubjectRulePatch[]) => number
  'subjectRule:listClassrooms': () => SubjectClassroom[]
  'subjectRule:setClassrooms': (
    subjectId: number,
    bindings: { classroomId: number; slotsTaken: number; priority: number }[]
  ) => SubjectClassroom[]
  /** 把连堂设置批量下发到该学科的教学任务，返回受影响的任务数 */
  'subjectRule:applyConsecutive': (payload: {
    semesterId: number
    subjectId: number
    gradeIds?: number[]
    consecutiveCount: number
    consecutiveSize: number
  }) => number

  // ---- 预排锁定 fixed_lesson（M2） ----
  'fixedLesson:list': (semesterId: number) => FixedLesson[]
  'fixedLesson:upsert': (payload: FixedLessonInput) => FixedLesson
  'fixedLesson:delete': (id: number) => void
  'fixedLesson:bulkCreate': (payloads: FixedLessonInput[]) => FixedLesson[]
  'fixedLesson:conflicts': (semesterId: number) => FixedLessonConflict[]

  // ---- 约束组（M2） ----
  'constraintGroup:list': (semesterId: number) => ConstraintGroup[]
  'constraintGroup:upsert': (payload: ConstraintGroupInput) => ConstraintGroup
  'constraintGroup:delete': (id: number) => void

  // ---- 引擎输入快照（M2 只做「读出 + 自检」，求解在 M3） ----
  'solver:buildInput': (semesterId: number, weightProfileCode?: string) => SolverInput
  'solver:checkInput': (semesterId: number, weightProfileCode?: string) => SolverInputReport

  // ---- 课表版本与排课执行（M3 后半段） ----
  'schedule:listVersions': (semesterId: number) => ScheduleVersion[]
  'schedule:deleteVersion': (id: number) => void
  /** 启动一次排课（多起点 worker 真并行），进度与结果经 schedule:event 事件推送 */
  'schedule:start': (semesterId: number, options?: ScheduleStartOptions) => { runId: string }
  /** 取消进行中的排课（terminate worker，不落库） */
  'schedule:cancel': () => boolean
  'schedule:isRunning': () => boolean

  // ---- 课表 / 报告 / 导出 / 种子数据（M4/M7/M8 占位） ----
  // 'timetable:byClass': (classId: number) => unknown
  // 'report:health': (versionId: number) => unknown
  // 'export:excel': (p: unknown) => { filePath: string }
  // 'seed:load': (preset: 'primary' | 'junior' | 'senior') => void
}

export type IpcChannel = keyof IpcApi

// ---- 排课执行（M3）· 事件与结果载荷 ----

/** schedule:start 的可选参数 */
export interface ScheduleStartOptions {
  /** 风格档位 code，默认 balanced */
  weightProfileCode?: string
  /** 多起点数，默认 min(CPU, 8)（docs/04 §4.4） */
  starts?: number
  /** 构造阶段时间预算（毫秒），默认 30s */
  timeBudgetMs?: number
  seed?: number
}

/** solve() 结果的展示投影（跨 worker / IPC 边界的那部分） */
export interface SolveSummaryPayload {
  status: 'solved' | 'partial' | 'infeasible' | 'cancelled'
  seed: number
  unplacedCount: number
  violations: HardViolation[]
  diagnostics: Diagnosis[]
  lessons: PlacedLesson[]
  stats: {
    units: number
    periods: number
    assignedPeriods: number
    fixedPeriods: number
    starts: number
    elapsedMs: number
    prunedByAc3: number
    accidentalBlocks: number
  }
}

/** 排课进度事件（单一通道 schedule:event，type 区分） */
export interface ScheduleProgressPayload {
  type: 'progress'
  runId: string
  /** 0~1，多起点按各自最新进度折算 */
  ratio: number
  message: string
  phase: SolvePhase
  start: number
  totalStarts: number
}

/** 排课结束事件 */
export interface ScheduleDonePayload {
  type: 'done'
  runId: string
  status: 'solved' | 'partial' | 'infeasible' | 'cancelled' | 'failed'
  /** 成功落库后的版本（infeasible / cancelled / failed 为 null） */
  versionId: number | null
  versionName: string | null
  lessonCount: number
  lockedCount: number
  skippedFixed: number
  summary: SolveSummaryPayload | null
  error?: string
}

export type ScheduleEventPayload = ScheduleProgressPayload | ScheduleDonePayload

/** Main → Renderer 的事件推送通道 */
export type IpcEvents = {
  'schedule:event': (payload: ScheduleEventPayload) => void
}

export type IpcEventChannel = keyof IpcEvents
