import { describe, expect, it } from 'vitest'
import { loadPreset } from './presetService'
import { getDb } from '../db/connection'

describe('M8 · 预设示范数据与一键体验', () => {
  it('loads "junior" preset and verifies database records', () => {
    const res = loadPreset('junior')
    expect(res.success).toBe(true)
    expect(res.semesterId).toBeGreaterThan(0)

    const db = getDb()
    const school = db.prepare('SELECT name, school_type FROM school WHERE id = 1').get() as {
      name: string
      school_type: string
    }
    expect(school.name).toBe('阳光实验初级中学')
    expect(school.school_type).toBe('junior')

    // 检查年级班级
    const grades = db.prepare('SELECT COUNT(*) as n FROM grade WHERE semester_id = ?').get(res.semesterId) as { n: number }
    expect(grades.n).toBe(3) // 初一、初二、初三

    const classes = db.prepare(
      'SELECT COUNT(*) as n FROM klass k JOIN grade g ON g.id = k.grade_id WHERE g.semester_id = ?'
    ).get(res.semesterId) as { n: number }
    expect(classes.n).toBe(18) // 3 年级 × 6 班 = 18 班

    // 检查教学任务
    const tasks = db.prepare('SELECT COUNT(*) as n FROM teaching_task WHERE semester_id = ?').get(res.semesterId) as { n: number }
    expect(tasks.n).toBeGreaterThan(100)

    // 检查是否自动生成并发布了初始排课方案
    const versions = db.prepare('SELECT COUNT(*) as n FROM schedule_version WHERE semester_id = ?').get(res.semesterId) as { n: number }
    expect(versions.n).toBeGreaterThanOrEqual(1)
  })

  it('loads "senior" preset with night study and reading slots', () => {
    const res = loadPreset('senior')
    expect(res.success).toBe(true)

    const db = getDb()
    const slots = db.prepare(
      'SELECT COUNT(*) as n FROM time_slot WHERE stage_id = 3'
    ).get() as { n: number }
    expect(slots.n).toBe(65) // 高中 13 节/天 × 5 天 = 65 槽
  })
})
