/**
 * 领域实体类型（渲染层视角，字段一律 camelCase）。
 * 主进程 Repository 负责在 snake_case 行与这些类型之间转换，渲染层永远只见 camelCase。
 */
import type {
  FixedLessonKind,
  GroupHardness,
  GroupMemberType,
  GroupType,
  RoomType,
  RuleScopeType,
  RuleValue,
  SchoolType,
  Segment,
  SubjectCategory,
  WeekMode,
  WeekSpread
} from '../domain'

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

// ============================================================================
// M2 · 教学任务与规则
// ============================================================================

// ---- 教学任务（排课输入核心，docs/03 §3.5） ----
export interface TeachingTask {
  id: number
  semesterId: number
  classId: number
  subjectId: number
  teacherId: number | null
  weeklyPeriods: number
  consecutiveCount: number
  consecutiveSize: number
  weekMode: WeekMode
  mergeGroupId: number | null
  fixedRoomId: number | null
}
export interface TeachingTaskInput {
  id?: number
  semesterId: number
  classId: number
  subjectId: number
  teacherId?: number | null
  weeklyPeriods: number
  consecutiveCount?: number
  consecutiveSize?: number
  weekMode?: WeekMode
  mergeGroupId?: number | null
  fixedRoomId?: number | null
}

/**
 * 矩阵编辑器一次提交的单元格补丁。
 * 只带需要改的字段：`weeklyPeriods` 为 0 表示删除该任务；`teacherId` 为 undefined 表示不动教师。
 */
export interface MatrixCellPatch {
  classId: number
  subjectId: number
  weeklyPeriods?: number
  teacherId?: number | null
}

/** 教学任务矩阵的一次性读取结果（行=班级、列=学科） */
export interface TeachingMatrix {
  semesterId: number
  tasks: TeachingTask[]
}

/** 教师工作量看板的一行 */
export interface TeacherWorkload {
  teacherId: number
  name: string
  maxWeeklyPeriods: number
  /** 已指派的周课时合计 */
  assignedPeriods: number
  /** 带课班级数 */
  classCount: number
  /** 任教学科 id */
  subjectIds: number[]
  /** assignedPeriods > maxWeeklyPeriods */
  over: boolean
}

/** 课时方案套用的结果回执 */
export interface CurriculumApplyResult {
  created: number
  updated: number
  skippedSubjects: string[]
  affectedClasses: number
}

// ---- 四层时段规则（docs/03 §3.6 time_rule，决策 D4） ----
export interface TimeRule {
  id: number
  semesterId: number
  scopeType: RuleScopeType
  scopeId: number | null
  slotId: number
  ruleValue: RuleValue
}
/** 作用域引用：global 时 scopeId 恒为 null */
export interface RuleScopeRef {
  scopeType: RuleScopeType
  scopeId: number | null
}
/** RuleGrid 一次拖刷提交的批量补丁 */
export interface TimeRulePatch {
  slotId: number
  ruleValue: RuleValue
}
/** 「哪些实体配过规则」的统计，用于作用域切换器右上角提示 */
export interface RuleScopeSummary {
  scopeType: RuleScopeType
  scopeId: number | null
  ruleCount: number
  forbiddenCount: number
  avoidCount: number
  preferredCount: number
}

// ---- 学科规则（每日上限 / 分布策略 / 连堂默认值） ----
/** 学科规则批量保存的一行（落到 subject 表的 daily_max / week_spread / importance） */
export interface SubjectRulePatch {
  subjectId: number
  dailyMax: number
  weekSpread: WeekSpread
  importance: number
  needSpecialRoom: boolean
}
/** 学科→专用教室绑定（docs/03 §3.4 subject_classroom） */
export interface SubjectClassroom {
  subjectId: number
  classroomId: number
  slotsTaken: number
  priority: number
}
/** 把连堂设置批量写进该学科的教学任务 */
export interface ConsecutiveApplyInput {
  semesterId: number
  subjectId: number
  /** 限定年级；为空表示全校 */
  gradeIds?: number[]
  consecutiveCount: number
  consecutiveSize: number
}

// ---- 预排锁定（docs/03 §3.6 fixed_lesson） ----
export interface FixedLesson {
  id: number
  semesterId: number
  /** lesson = 预排一节课（须绑班级/年级）；block = 仅占用教师或教室 */
  kind: FixedLessonKind
  classId: number | null
  gradeId: number | null
  subjectId: number | null
  teacherId: number | null
  classroomId: number | null
  slotId: number
  label: string | null
}
export interface FixedLessonInput {
  id?: number
  semesterId: number
  /** 省略时按 lesson 处理，与 migration 006 之前的行为一致 */
  kind?: FixedLessonKind
  classId?: number | null
  gradeId?: number | null
  subjectId?: number | null
  teacherId?: number | null
  classroomId?: number | null
  slotId: number
  label?: string | null
}

// ---- 约束组（docs/03 §3.6 constraint_group + group_member） ----
export interface GroupMember {
  memberType: GroupMemberType
  memberId: number
}
export interface ConstraintGroup {
  id: number
  semesterId: number
  groupType: GroupType
  name: string
  hardness: GroupHardness
  maxConcurrent: number | null
  scopeNote: string | null
  members: GroupMember[]
}
export interface ConstraintGroupInput {
  id?: number
  semesterId: number
  groupType: GroupType
  name: string
  hardness?: GroupHardness
  maxConcurrent?: number | null
  scopeNote?: string | null
  members: GroupMember[]
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

// ---- 课表版本与课表项（M3，docs/03 §3.7） ----
export interface ScheduleVersion {
  id: number
  semesterId: number
  parentId: number | null
  name: string
  /** 使用的风格档位 code（teacher_first / balanced / student_first） */
  weightProfile: string | null
  hardViolations: number
  softScore: number
  /** 各维度指标快照（JSON 解析后的对象，解析失败为 null） */
  metrics: Record<string, unknown> | null
  solveMs: number | null
  isPublished: boolean
  createdAt: string
  /** 该版本包含的课表行数（含预排锁定行） */
  lessonCount: number
}

export interface Lesson {
  id: number
  versionId: number
  taskId: number
  classId: number
  subjectId: number
  teacherId: number | null
  classroomId: number | null
  slotId: number
  weekMode: WeekMode
  /** 预排锁定钉死的课为 true */
  isLocked: boolean
  /** 同一连堂块共享一个 uuid，非连堂为 null */
  consecutiveGroup: string | null
  remark: string | null
}
