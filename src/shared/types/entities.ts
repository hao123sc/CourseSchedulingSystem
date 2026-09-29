/**
 * 领域实体类型（渲染层视角，字段一律 camelCase）。
 * 主进程 Repository 负责在 snake_case 行与这些类型之间转换，渲染层永远只见 camelCase。
 */
import type { RoomType, SchoolType, Segment, SubjectCategory, WeekSpread } from '../domain'

// ---- 学校与学期 ----
export interface School {
  id: 1
  name: string
  schoolType: SchoolType
  logoPath: string | null
  createdAt: string
}
export interface SchoolInput {
  name: string
  schoolType: SchoolType
  logoPath?: string | null
}

export interface Semester {
  id: number
  name: string
  startDate: string | null
  endDate: string | null
  isCurrent: boolean
  createdAt: string
}
export interface SemesterInput {
  id?: number
  name: string
  startDate?: string | null
  endDate?: string | null
}

// ---- 学段与作息 ----
export interface Stage {
  id: number
  code: string
  name: string
  sortOrder: number
  daysPerWeek: number
  hasEvening: boolean
  enabled: boolean
}
export interface StageInput {
  id?: number
  code: string
  name: string
  sortOrder?: number
  daysPerWeek?: number
  hasEvening?: boolean
  enabled?: boolean
}

export interface TimeSlot {
  id: number
  stageId: number
  dayOfWeek: number
  periodIndex: number
  periodName: string
  segment: Segment
  startTime: string | null
  endTime: string | null
  isTeaching: boolean
  sortOrder: number
}
/** 作息编辑器保存整表时使用的行模板（不含 id / stageId / dayOfWeek，跨每天复制） */
export interface PeriodTemplate {
  periodIndex: number
  periodName: string
  segment: Segment
  startTime?: string | null
  endTime?: string | null
  isTeaching?: boolean
}

// ---- 年级与班级 ----
export interface Grade {
  id: number
  semesterId: number
  stageId: number
  name: string
  enrollYear: number | null
  sortOrder: number
}
export interface GradeInput {
  id?: number
  semesterId: number
  stageId: number
  name: string
  enrollYear?: number | null
  sortOrder?: number
}

export interface Klass {
  id: number
  gradeId: number
  name: string
  shortName: string | null
  studentCount: number
  headTeacherId: number | null
  homeRoomId: number | null
  isVirtual: boolean
  sortOrder: number
}
export interface KlassInput {
  id?: number
  gradeId: number
  name: string
  shortName?: string | null
  studentCount?: number
  headTeacherId?: number | null
  homeRoomId?: number | null
  isVirtual?: boolean
  sortOrder?: number
}
export interface ClassBatchInput {
  gradeId: number
  count: number
  /** 命名模板，占位符 {n}=序号、{name}=年级名。如 "初一({n})班" */
  namePattern: string
  startIndex?: number
  studentCount?: number
}

// ---- 学科 ----
export interface Subject {
  id: number
  name: string
  shortName: string
  color: string
  category: SubjectCategory
  importance: number
  needSpecialRoom: boolean
  stageId: number | null
  dailyMax: number
  weekSpread: WeekSpread
  sortOrder: number
}
export interface SubjectInput {
  id?: number
  name: string
  shortName: string
  color: string
  category?: SubjectCategory
  importance?: number
  needSpecialRoom?: boolean
  stageId?: number | null
  dailyMax?: number
  weekSpread?: WeekSpread
  sortOrder?: number
}

// ---- 教师 ----
export interface Teacher {
  id: number
  name: string
  staffNo: string | null
  phone: string | null
  maxWeeklyPeriods: number
  building: string | null
  enabled: boolean
  /** 任教学科 id（teacher_subject 关联） */
  subjectIds: number[]
}
export interface TeacherInput {
  id?: number
  name: string
  staffNo?: string | null
  phone?: string | null
  maxWeeklyPeriods?: number
  building?: string | null
  enabled?: boolean
  subjectIds?: number[]
}

// ---- 教室 ----
export interface Classroom {
  id: number
  name: string
  roomType: RoomType
  capacity: number
  concurrentCapacity: number
  building: string | null
  enabled: boolean
}
export interface ClassroomInput {
  id?: number
  name: string
  roomType?: RoomType
  capacity?: number
  concurrentCapacity?: number
  building?: string | null
  enabled?: boolean
}

// ---- 风格权重档位 ----
export interface WeightProfile {
  id: number
  code: string
  name: string
  payload: Record<string, number>
}

// ---- Excel 导入/导出结果 ----
export interface ExcelExportResult {
  canceled: boolean
  filePath: string | null
  count: number
}
export interface ExcelImportResult {
  canceled: boolean
  imported: number
  skipped: number
  errors: string[]
}
