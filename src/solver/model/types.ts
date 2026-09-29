/**
 * 排课引擎的输入快照类型。
 *
 * 纪律（docs/02 §3）：`src/solver/**` 是**纯 TS、零 IO**，
 * 禁止 import Electron / Node 模块。主进程负责从 SQLite 读全量数据组装成
 * `SolverInput` 后交给引擎；引擎只认这里定义的结构，不认数据库。
 *
 * M2 阶段只定义 **输入侧**（本文件）与其校验，使「数据可完整读出为 SolverInput」可验收；
 * `Solution` / `Assignment` 等求解侧建模留给 M3。
 */
import type { RuleValue, Segment, WeekMode } from '@shared/domain'

// ── 时间维度 ──────────────────────────────────────────────────────────────
export interface SolverSlot {
  id: number
  stageId: number
  dayOfWeek: number
  periodIndex: number
  periodName: string
  segment: Segment
  /** 非教学占位（课间操 / 午休）不参与排课 */
  isTeaching: boolean
  sortOrder: number
}

export interface SolverStage {
  id: number
  code: string
  name: string
  daysPerWeek: number
  hasEvening: boolean
  /** 该学段的教学时段 id（已过滤 isTeaching=0），按 sortOrder 排序 */
  slotIds: number[]
}

// ── 实体 ──────────────────────────────────────────────────────────────────
export interface SolverClass {
  id: number
  gradeId: number
  stageId: number
  name: string
  studentCount: number
  /** 固定教室（普通课默认排这里） */
  homeRoomId: number | null
}

export interface SolverGrade {
  id: number
  stageId: number
  name: string
  classIds: number[]
}

export interface SolverTeacher {
  id: number
  name: string
  maxWeeklyPeriods: number
  building: string | null
  subjectIds: number[]
}

export interface SolverSubject {
  id: number
  name: string
  shortName: string
  importance: number
  needSpecialRoom: boolean
  /** 同班每日最多节数（软约束 S1 的阈值） */
  dailyMax: number
  /** spread=尽量分散到不同天；concentrate=允许集中 */
  weekSpread: 'spread' | 'concentrate'
  /** 可用专用教室（空数组表示不限定，用班级固定教室） */
  allowedRooms: SolverSubjectRoom[]
}

export interface SolverSubjectRoom {
  classroomId: number
  /** 该学科在该场地占用的班位数（H3 并发容量） */
  slotsTaken: number
  priority: number
}

export interface SolverRoom {
  id: number
  name: string
  roomType: string
  /** 座位数（H3b 人数容量） */
  capacity: number
  /** 同时可容纳的教学班数（H3 并发容量，普通教室=1） */
  concurrentCapacity: number
  building: string | null
}

// ── 任务与规则 ────────────────────────────────────────────────────────────
export interface SolverTask {
  id: number
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

export interface SolverTimeRule {
  scopeType: 'teacher' | 'class' | 'subject' | 'grade' | 'global'
  scopeId: number | null
  slotId: number
  ruleValue: RuleValue
}

export interface SolverFixedLesson {
  id: number
  classId: number | null
  gradeId: number | null
  subjectId: number | null
  teacherId: number | null
  classroomId: number | null
  slotId: number
  label: string | null
}

export interface SolverConstraintGroup {
  id: number
  groupType: 'teacher_mutex' | 'subject_mutex' | 'merge' | 'follow' | 'simultaneous'
  name: string
  hardness: 'hard' | 'soft'
  maxConcurrent: number | null
  scopeNote: string | null
  members: { memberType: 'teacher' | 'subject' | 'class' | 'task'; memberId: number }[]
}

/** 某场地上「两个学科能否同时段共用」的白/黑名单（docs/03 room_coexist_rule） */
export interface SolverRoomCoexistRule {
  classroomId: number
  subjectA: number
  subjectB: number
  allowed: boolean
}

// ── 顶层快照 ──────────────────────────────────────────────────────────────
export interface SolverInput {
  semesterId: number
  semesterName: string
  /** 生成时间，便于比对快照新鲜度 */
  generatedAt: string
  /** 软约束权重档位（S1..S15） */
  weightProfileCode: string
  weights: Record<string, number>

  stages: SolverStage[]
  slots: SolverSlot[]
  grades: SolverGrade[]
  classes: SolverClass[]
  teachers: SolverTeacher[]
  subjects: SolverSubject[]
  rooms: SolverRoom[]

  tasks: SolverTask[]
  timeRules: SolverTimeRule[]
  fixedLessons: SolverFixedLesson[]
  constraintGroups: SolverConstraintGroup[]
  roomCoexistRules: SolverRoomCoexistRule[]
}
