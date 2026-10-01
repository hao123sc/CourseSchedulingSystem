/**
 * 国家课程标准 · 周课时方案预设（「一键套用」的数据源）。
 *
 * 依据：
 *  - 义务教育阶段（小学 1-2 / 3-6、初中 7-9）：《义务教育课程方案和课程标准（2022 年版）》
 *    课程设置与九年总课时（9522 节）各科占比，折算为常见落地的**周课时**。
 *  - 高中阶段：《普通高中课程方案（2017 年版 2020 年修订）》必修学分折算
 *    （1 学分 = 18 课时，一学期约 18 周 → 1 学分 ≈ 1 节/周）。
 *
 * ⚠️ 这些数字是**可编辑的参考值**，不是硬约束：
 *    各地课程计划有差异，UI 套用前会展示明细表，教务可逐格改完再落库。
 *    学科用**名称**匹配 subject 表（名称对不上的会被跳过并回报），不写死学科 id。
 *
 * 本文件位于 shared/**，禁止 import Electron / Node，供渲染层与引擎共用。
 */

export interface CurriculumEntry {
  /** 学科名称，需与 subject.name 一致 */
  subject: string
  /** 周课时 */
  periods: number
}

export interface CurriculumPlan {
  code: string
  /** 对应 stage.code；套用时用于过滤可选年级 */
  stageCode: 'primary' | 'junior' | 'senior'
  /** 方案名，如「七年级（初一）」 */
  name: string
  /** 匹配年级名的关键字，用于「自动匹配年级」 */
  gradeKeywords: string[]
  /** 依据说明，显示在套用弹窗里 */
  source: string
  entries: CurriculumEntry[]
}

export const CURRICULUM_PRESETS: CurriculumPlan[] = [
  // ── 小学 ──────────────────────────────────────────────────────────────
  {
    code: 'primary_g1_2',
    stageCode: 'primary',
    name: '小学一至二年级',
    gradeKeywords: ['一年级', '二年级', '小一', '小二'],
    source: '义务教育课程方案（2022 年版）· 一二年级周课时 26 节',
    entries: [
      { subject: '语文', periods: 8 },
      { subject: '数学', periods: 4 },
      { subject: '体育', periods: 4 },
      { subject: '道德与法治', periods: 2 },
      { subject: '音乐', periods: 2 },
      { subject: '美术', periods: 2 },
      { subject: '科学', periods: 1 },
      { subject: '劳动', periods: 1 },
      { subject: '综合实践', periods: 1 },
      { subject: '班会', periods: 1 }
    ]
  },
  {
    code: 'primary_g3_6',
    stageCode: 'primary',
    name: '小学三至六年级',
    gradeKeywords: ['三年级', '四年级', '五年级', '六年级', '小三', '小四', '小五', '小六'],
    source: '义务教育课程方案（2022 年版）· 三至六年级周课时 30 节',
    entries: [
      { subject: '语文', periods: 7 },
      { subject: '数学', periods: 5 },
      { subject: '英语', periods: 3 },
      { subject: '体育', periods: 3 },
      { subject: '道德与法治', periods: 2 },
      { subject: '科学', periods: 2 },
      { subject: '音乐', periods: 2 },
      { subject: '美术', periods: 2 },
      { subject: '信息技术', periods: 1 },
      { subject: '劳动', periods: 1 },
      { subject: '综合实践', periods: 1 },
      { subject: '班会', periods: 1 }
    ]
  },

  // ── 初中 ──────────────────────────────────────────────────────────────
  {
    code: 'junior_g7',
    stageCode: 'junior',
    name: '七年级（初一）',
    gradeKeywords: ['七年级', '初一', '初中一年级'],
    source: '义务教育课程方案（2022 年版）· 七年级学科周课时 31 节',
    entries: [
      { subject: '语文', periods: 5 },
      { subject: '数学', periods: 5 },
      { subject: '英语', periods: 4 },
      { subject: '体育', periods: 3 },
      { subject: '道德与法治', periods: 2 },
      { subject: '历史', periods: 2 },
      { subject: '地理', periods: 2 },
      { subject: '生物', periods: 2 },
      { subject: '音乐', periods: 1 },
      { subject: '美术', periods: 1 },
      { subject: '信息技术', periods: 1 },
      { subject: '劳动', periods: 1 },
      { subject: '综合实践', periods: 1 },
      { subject: '班会', periods: 1 }
    ]
  },
  {
    code: 'junior_g8',
    stageCode: 'junior',
    name: '八年级（初二）',
    gradeKeywords: ['八年级', '初二', '初中二年级'],
    source: '义务教育课程方案（2022 年版）· 八年级学科周课时 33 节（新增物理）',
    entries: [
      { subject: '语文', periods: 5 },
      { subject: '数学', periods: 5 },
      { subject: '英语', periods: 4 },
      { subject: '体育', periods: 3 },
      { subject: '物理', periods: 2 },
      { subject: '道德与法治', periods: 2 },
      { subject: '历史', periods: 2 },
      { subject: '地理', periods: 2 },
      { subject: '生物', periods: 2 },
      { subject: '音乐', periods: 1 },
      { subject: '美术', periods: 1 },
      { subject: '信息技术', periods: 1 },
      { subject: '劳动', periods: 1 },
      { subject: '综合实践', periods: 1 },
      { subject: '班会', periods: 1 }
    ]
  },
  {
    code: 'junior_g9',
    stageCode: 'junior',
    name: '九年级（初三）',
    gradeKeywords: ['九年级', '初三', '初中三年级'],
    source: '义务教育课程方案（2022 年版）· 九年级学科周课时 33 节（新增化学，地理生物已结课）',
    entries: [
      { subject: '语文', periods: 5 },
      { subject: '数学', periods: 5 },
      { subject: '英语', periods: 5 },
      { subject: '物理', periods: 3 },
      { subject: '化学', periods: 3 },
      { subject: '体育', periods: 3 },
      { subject: '道德与法治', periods: 2 },
      { subject: '历史', periods: 2 },
      { subject: '音乐', periods: 1 },
      { subject: '美术', periods: 1 },
      { subject: '信息技术', periods: 1 },
      { subject: '劳动', periods: 1 },
      { subject: '班会', periods: 1 }
    ]
  },

  // ── 高中 ──────────────────────────────────────────────────────────────
  {
    code: 'senior_g1',
    stageCode: 'senior',
    name: '高一',
    gradeKeywords: ['高一', '高中一年级'],
    source: '普通高中课程方案（2017 年版 2020 年修订）· 必修学分折算，周课时 34 节',
    entries: [
      { subject: '语文', periods: 4 },
      { subject: '数学', periods: 4 },
      { subject: '英语', periods: 4 },
      { subject: '物理', periods: 2 },
      { subject: '化学', periods: 2 },
      { subject: '生物', periods: 2 },
      { subject: '政治', periods: 2 },
      { subject: '历史', periods: 2 },
      { subject: '地理', periods: 2 },
      { subject: '信息技术', periods: 2 },
      { subject: '体育', periods: 2 },
      { subject: '通用技术', periods: 1 },
      { subject: '音乐', periods: 1 },
      { subject: '美术', periods: 1 },
      { subject: '劳动', periods: 1 },
      { subject: '综合实践', periods: 1 },
      { subject: '班会', periods: 1 }
    ]
  },
  {
    code: 'senior_g2',
    stageCode: 'senior',
    name: '高二',
    gradeKeywords: ['高二', '高中二年级'],
    source: '普通高中课程方案 · 选择性必修阶段参考值，周课时 34 节（走班选科见 M9）',
    entries: [
      { subject: '语文', periods: 4 },
      { subject: '数学', periods: 4 },
      { subject: '英语', periods: 4 },
      { subject: '物理', periods: 3 },
      { subject: '化学', periods: 3 },
      { subject: '生物', periods: 3 },
      { subject: '政治', periods: 3 },
      { subject: '历史', periods: 3 },
      { subject: '地理', periods: 3 },
      { subject: '体育', periods: 2 },
      { subject: '信息技术', periods: 1 },
      { subject: '班会', periods: 1 }
    ]
  },
  {
    code: 'senior_g3',
    stageCode: 'senior',
    name: '高三',
    gradeKeywords: ['高三', '高中三年级'],
    source: '普通高中课程方案 · 高三复习阶段常见课时安排，周课时 36 节',
    entries: [
      { subject: '语文', periods: 5 },
      { subject: '数学', periods: 5 },
      { subject: '英语', periods: 5 },
      { subject: '物理', periods: 3 },
      { subject: '化学', periods: 3 },
      { subject: '生物', periods: 3 },
      { subject: '政治', periods: 3 },
      { subject: '历史', periods: 3 },
      { subject: '地理', periods: 3 },
      { subject: '体育', periods: 2 },
      { subject: '班会', periods: 1 }
    ]
  }
]

/** 方案周课时合计 */
export function planTotal(plan: CurriculumPlan): number {
  return plan.entries.reduce((s, e) => s + e.periods, 0)
}

export function findPlan(code: string): CurriculumPlan | undefined {
  return CURRICULUM_PRESETS.find((p) => p.code === code)
}

/**
 * 按年级名自动挑一套方案。
 * 先在同学段内按关键字匹配；匹配不到则退回该学段的第一套（小学退回 3-6 年级方案）。
 */
export function suggestPlanForGrade(
  gradeName: string,
  stageCode: string | undefined
): CurriculumPlan | undefined {
  const pool = stageCode
    ? CURRICULUM_PRESETS.filter((p) => p.stageCode === stageCode)
    : CURRICULUM_PRESETS
  const hit = pool.find((p) => p.gradeKeywords.some((k) => gradeName.includes(k)))
  if (hit) return hit
  if (stageCode === 'primary') return findPlan('primary_g3_6')
  return pool[0]
}
