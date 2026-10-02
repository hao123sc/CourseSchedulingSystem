import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  CURRICULUM_PRESETS,
  findPlan,
  planTotal,
  suggestPlanForGrade
} from './curriculumPresets'

/** 从 003 种子 SQL 里抽出内置学科名，确保预设里的学科名能对上号 */
function seededSubjectNames(): Set<string> {
  const sql = readFileSync(
    join(__dirname, '../main/db/migrations/003_seed_subjects.sql'),
    'utf-8'
  )
  const names = new Set<string>()
  for (const m of sql.matchAll(/\('([^']+)','[^']*','#/g)) names.add(m[1])
  return names
}

describe('国家课程标准课时方案预设', () => {
  it('覆盖三个学段，code 唯一', () => {
    const codes = CURRICULUM_PRESETS.map((p) => p.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const stage of ['primary', 'junior', 'senior'] as const) {
      expect(CURRICULUM_PRESETS.some((p) => p.stageCode === stage)).toBe(true)
    }
  })

  it('每套方案课时为正、周合计在合理区间（20~40 节）', () => {
    for (const p of CURRICULUM_PRESETS) {
      expect(p.entries.length).toBeGreaterThan(0)
      for (const e of p.entries) expect(e.periods).toBeGreaterThan(0)
      const total = planTotal(p)
      expect(total, `${p.name} 周合计 ${total}`).toBeGreaterThanOrEqual(20)
      expect(total, `${p.name} 周合计 ${total}`).toBeLessThanOrEqual(40)
    }
  })

  it('同一方案内不出现重复学科', () => {
    for (const p of CURRICULUM_PRESETS) {
      const names = p.entries.map((e) => e.subject)
      expect(new Set(names).size, `${p.name} 有重复学科`).toBe(names.length)
    }
  })

  it('全部学科名都能在内置学科种子里找到（否则套用时会被跳过）', () => {
    const seeded = seededSubjectNames()
    expect(seeded.size).toBeGreaterThan(10)
    for (const p of CURRICULUM_PRESETS) {
      for (const e of p.entries) {
        expect(seeded.has(e.subject), `${p.name} 的「${e.subject}」不在内置学科表里`).toBe(true)
      }
    }
  })

  it('初中三个年级课时随年级递进（九年级不少于七年级）', () => {
    const g7 = planTotal(findPlan('junior_g7')!)
    const g9 = planTotal(findPlan('junior_g9')!)
    expect(g9).toBeGreaterThanOrEqual(g7)
  })

  it('九年级有化学、七年级没有（符合义教课程方案开课年级）', () => {
    const g7 = findPlan('junior_g7')!
    const g9 = findPlan('junior_g9')!
    expect(g7.entries.some((e) => e.subject === '化学')).toBe(false)
    expect(g9.entries.some((e) => e.subject === '化学')).toBe(true)
    expect(g7.entries.some((e) => e.subject === '物理')).toBe(false)
  })

  it('suggestPlanForGrade 能按年级名匹配', () => {
    expect(suggestPlanForGrade('初一', 'junior')?.code).toBe('junior_g7')
    expect(suggestPlanForGrade('七年级', 'junior')?.code).toBe('junior_g7')
    expect(suggestPlanForGrade('九年级', 'junior')?.code).toBe('junior_g9')
    expect(suggestPlanForGrade('高二', 'senior')?.code).toBe('senior_g2')
    expect(suggestPlanForGrade('五年级', 'primary')?.code).toBe('primary_g3_6')
  })

  it('匹配不到时退回该学段的默认方案，不返回 undefined', () => {
    expect(suggestPlanForGrade('实验班', 'primary')?.code).toBe('primary_g3_6')
    expect(suggestPlanForGrade('创新班', 'junior')?.stageCode).toBe('junior')
  })
})
