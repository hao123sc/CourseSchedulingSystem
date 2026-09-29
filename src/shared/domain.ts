/**
 * 领域枚举与常量。shared/** 禁止 import Electron / Node，纯常量供三端与引擎共用。
 */

export const SCHOOL_TYPES = [
  { value: 'primary', label: '小学' },
  { value: 'junior', label: '初中' },
  { value: 'senior', label: '高中' },
  { value: 'nine_year', label: '九年一贯制' },
  { value: 'complete', label: '完全中学' },
  { value: 'twelve_year', label: '十二年一贯制' }
] as const
export type SchoolType = (typeof SCHOOL_TYPES)[number]['value']

export const SEGMENTS = [
  { value: 'morning', label: '上午' },
  { value: 'afternoon', label: '下午' },
  { value: 'evening', label: '晚上' }
] as const
export type Segment = (typeof SEGMENTS)[number]['value']

export const SUBJECT_CATEGORIES = [
  { value: 'main', label: '主科' },
  { value: 'minor', label: '副科' },
  { value: 'activity', label: '活动课' }
] as const
export type SubjectCategory = (typeof SUBJECT_CATEGORIES)[number]['value']

export const WEEK_SPREADS = [
  { value: 'spread', label: '分散' },
  { value: 'concentrate', label: '集中' }
] as const
export type WeekSpread = (typeof WEEK_SPREADS)[number]['value']

export const ROOM_TYPES = [
  { value: 'normal', label: '普通教室' },
  { value: 'lab', label: '实验室' },
  { value: 'computer', label: '计算机房' },
  { value: 'music', label: '音乐教室' },
  { value: 'art', label: '美术教室' },
  { value: 'sports', label: '体育场地' },
  { value: 'other', label: '其他' }
] as const
export type RoomType = (typeof ROOM_TYPES)[number]['value']

export const WEEK_MODES = [
  { value: 'all', label: '每周' },
  { value: 'odd', label: '单周' },
  { value: 'even', label: '双周' }
] as const
export type WeekMode = (typeof WEEK_MODES)[number]['value']

/** D4 规则原语：四层时段规则值。顺序即「由松到紧」的严格程度排序基准 */
export const RULE_VALUES = ['FORBIDDEN', 'AVOID', 'NORMAL', 'PREFERRED'] as const
export type RuleValue = (typeof RULE_VALUES)[number]

/**
 * 四层规则值的展示元数据（画笔、图例、网格底色共用一份）。
 * 配色取自 docs/05 §4.3 的 ⬜常规 / 🟦优选 / 🟨避排 / 🟥禁排。
 */
export interface RuleValueMeta {
  value: RuleValue
  label: string
  short: string
  /** 浅色主题格子底色 / 文字色 / 边框色 */
  bg: string
  text: string
  border: string
  hint: string
}

export const RULE_VALUE_META: Record<RuleValue, RuleValueMeta> = {
  NORMAL: {
    value: 'NORMAL',
    label: '常规',
    short: '常',
    bg: '#FFFFFF',
    text: '#64748B',
    border: '#E2E8F0',
    hint: '默认状态，可自由排课'
  },
  PREFERRED: {
    value: 'PREFERRED',
    label: '优选',
    short: '优',
    bg: '#DBEAFE',
    text: '#1D4ED8',
    border: '#93C5FD',
    hint: '软约束奖励（S5，负权）：排到这里加分'
  },
  AVOID: {
    value: 'AVOID',
    label: '避排',
    short: '避',
    bg: '#FEF3C7',
    text: '#B45309',
    border: '#FCD34D',
    hint: '软约束惩罚（S4）：尽量不排，实在排不开可以排'
  },
  FORBIDDEN: {
    value: 'FORBIDDEN',
    label: '禁排',
    short: '禁',
    bg: '#FEE2E2',
    text: '#B91C1C',
    border: '#FCA5A5',
    hint: '硬约束（H5）：绝对不可排入'
  }
}

/** 画笔顺序：与 docs/05 §4.3 的图例顺序一致 */
export const RULE_BRUSH_ORDER: RuleValue[] = ['NORMAL', 'PREFERRED', 'AVOID', 'FORBIDDEN']

/** 规则作用域。global 的 scopeId 恒为 null */
export const RULE_SCOPE_TYPES = [
  { value: 'teacher', label: '教师' },
  { value: 'class', label: '班级' },
  { value: 'subject', label: '学科' },
  { value: 'grade', label: '年级' },
  { value: 'global', label: '全局' }
] as const
export type RuleScopeType = (typeof RULE_SCOPE_TYPES)[number]['value']

/** 约束组类型（docs/03 §3.6 constraint_group.group_type） */
export const GROUP_TYPES = [
  {
    value: 'teacher_mutex',
    label: '教师互斥',
    hint: '组内教师不得排在同一时段（如夫妻档、跨校兼课）'
  },
  {
    value: 'subject_mutex',
    label: '学科互斥',
    hint: '组内学科不得在同一时段开课（如共用同一批专用教室）'
  },
  { value: 'merge', label: '合班拼合', hint: '组内教学任务合并成一节课，必须同时段同教师' },
  { value: 'follow', label: '跟随', hint: '组内任务尽量排在相邻时段或同一天' },
  { value: 'simultaneous', label: '同时上课', hint: '组内任务必须排在同一时段（如年级统一活动）' }
] as const
export type GroupType = (typeof GROUP_TYPES)[number]['value']

export const GROUP_HARDNESS = [
  { value: 'hard', label: '硬约束' },
  { value: 'soft', label: '软约束' }
] as const
export type GroupHardness = (typeof GROUP_HARDNESS)[number]['value']

export const GROUP_MEMBER_TYPES = [
  { value: 'teacher', label: '教师' },
  { value: 'subject', label: '学科' },
  { value: 'class', label: '班级' },
  { value: 'task', label: '教学任务' }
] as const
export type GroupMemberType = (typeof GROUP_MEMBER_TYPES)[number]['value']

/** 约束组类型 → 允许的成员类型（UI 据此限制选择器，避免配出引擎读不懂的组合） */
export const GROUP_TYPE_MEMBER_TYPES: Record<GroupType, GroupMemberType[]> = {
  teacher_mutex: ['teacher'],
  subject_mutex: ['subject'],
  merge: ['task'],
  follow: ['task'],
  simultaneous: ['task', 'class']
}

export const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'] as const

export function labelOf<T extends string>(
  list: ReadonlyArray<{ value: T; label: string }>,
  value: T
): string {
  return list.find((x) => x.value === value)?.label ?? value
}
