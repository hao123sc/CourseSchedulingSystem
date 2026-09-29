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

export const RULE_VALUES = ['FORBIDDEN', 'AVOID', 'NORMAL', 'PREFERRED'] as const
export type RuleValue = (typeof RULE_VALUES)[number]

export const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'] as const

export function labelOf<T extends string>(
  list: ReadonlyArray<{ value: T; label: string }>,
  value: T
): string {
  return list.find((x) => x.value === value)?.label ?? value
}
