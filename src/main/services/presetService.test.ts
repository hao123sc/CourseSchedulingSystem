import { describe, expect, it } from 'vitest'
import { loadPreset } from './presetService'
import { FULL_SCHOOL_EXPECTED } from './fullSchoolPresetService'
import { checkSolverInput } from './solverInputService'
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
    const grades = db
      .prepare('SELECT COUNT(*) as n FROM grade WHERE semester_id = ?')
      .get(res.semesterId) as { n: number }
    expect(grades.n).toBe(3) // 初一、初二、初三

    const classes = db
      .prepare(
        'SELECT COUNT(*) as n FROM klass k JOIN grade g ON g.id = k.grade_id WHERE g.semester_id = ?'
      )
      .get(res.semesterId) as { n: number }
    expect(classes.n).toBe(18) // 3 年级 × 6 班 = 18 班

    // 检查教学任务
    const tasks = db
      .prepare('SELECT COUNT(*) as n FROM teaching_task WHERE semester_id = ?')
      .get(res.semesterId) as { n: number }
    expect(tasks.n).toBeGreaterThan(100)

    // 检查是否自动生成并发布了初始排课方案
    const versions = db
      .prepare('SELECT COUNT(*) as n FROM schedule_version WHERE semester_id = ?')
      .get(res.semesterId) as { n: number }
    expect(versions.n).toBeGreaterThanOrEqual(1)
  })

  it('loads "senior" preset with night study and reading slots', () => {
    const res = loadPreset('senior')
    expect(res.success).toBe(true)

    const db = getDb()
    const slots = db.prepare('SELECT COUNT(*) as n FROM time_slot WHERE stage_id = 3').get() as {
      n: number
    }
    expect(slots.n).toBe(65) // 高中 13 节/天 × 5 天 = 65 槽
  })

  it('loads the real 240-class twelve-year golden dataset with complete resources and schedules', () => {
    const res = loadPreset('stress')
    expect(res.success).toBe(true)
    expect(res.versionId).toBeGreaterThan(0)

    const db = getDb()
    const scalar = (sql: string, ...params: unknown[]): number =>
      (db.prepare(sql).get(...params) as { n: number }).n
    const school = db.prepare('SELECT name, school_type FROM school WHERE id=1').get() as {
      name: string
      school_type: string
    }
    expect(school).toEqual({
      name: FULL_SCHOOL_EXPECTED.schoolName,
      school_type: 'twelve_year'
    })
    expect(scalar('SELECT COUNT(*) n FROM grade WHERE semester_id=?', res.semesterId)).toBe(12)
    expect(
      scalar(
        `SELECT COUNT(*) n FROM klass k JOIN grade g ON g.id=k.grade_id
            WHERE g.semester_id=?`,
        res.semesterId
      )
    ).toBe(FULL_SCHOOL_EXPECTED.classes)
    expect(
      scalar(
        `SELECT SUM(k.student_count) n FROM klass k JOIN grade g ON g.id=k.grade_id
            WHERE g.semester_id=?`,
        res.semesterId
      )
    ).toBe(FULL_SCHOOL_EXPECTED.students)
    expect(scalar('SELECT COUNT(*) n FROM teacher WHERE enabled=1')).toBe(
      FULL_SCHOOL_EXPECTED.teachers
    )
    expect(scalar('SELECT COUNT(*) n FROM classroom WHERE enabled=1')).toBe(
      FULL_SCHOOL_EXPECTED.rooms
    )
    expect(scalar('SELECT COUNT(*) n FROM subject')).toBe(FULL_SCHOOL_EXPECTED.subjects)
    expect(scalar('SELECT COUNT(*) n FROM teaching_task WHERE semester_id=?', res.semesterId)).toBe(
      FULL_SCHOOL_EXPECTED.tasks
    )
    expect(
      scalar('SELECT SUM(weekly_periods) n FROM teaching_task WHERE semester_id=?', res.semesterId)
    ).toBe(FULL_SCHOOL_EXPECTED.rawTaskPeriods)
    expect(scalar('SELECT COUNT(*) n FROM fixed_lesson WHERE semester_id=?', res.semesterId)).toBe(
      FULL_SCHOOL_EXPECTED.fixedLessons
    )
    expect(scalar('SELECT COUNT(DISTINCT head_teacher_id) n FROM klass')).toBe(240)
    expect(
      scalar('SELECT COUNT(*) n FROM constraint_group WHERE semester_id=?', res.semesterId)
    ).toBe(12)
    expect(scalar("SELECT COUNT(*) n FROM teaching_task WHERE week_mode IN ('odd','even')")).toBe(8)
    expect(
      scalar('SELECT COUNT(*) n FROM teaching_task WHERE consecutive_count > 0')
    ).toBeGreaterThan(0)
    expect(scalar("SELECT MIN(capacity) n FROM classroom WHERE room_type='normal'")).toBe(60)

    const stages = db
      .prepare(
        `SELECT s.code, COUNT(ts.id) n FROM stage s
          LEFT JOIN time_slot ts ON ts.stage_id=s.id
         WHERE s.enabled=1 GROUP BY s.id ORDER BY s.sort_order`
      )
      .all() as { code: string; n: number }[]
    expect(stages).toEqual([
      { code: 'primary', n: 35 },
      { code: 'junior', n: 40 },
      { code: 'senior', n: 65 }
    ])

    const overloads = scalar(
      `SELECT COUNT(*) n FROM (
           SELECT t.id
             FROM teacher t JOIN teaching_task x ON x.teacher_id=t.id
            GROUP BY t.id HAVING SUM(x.weekly_periods) > t.max_weekly_periods
         )`
    )
    expect(overloads).toBe(0)

    const report = checkSolverInput(res.semesterId)
    expect(report.ok).toBe(true)
    expect(report.stats.unassignedTasks).toBe(0)
    expect(report.issues.filter((issue) => issue.level === 'error')).toEqual([])

    expect(
      scalar('SELECT COUNT(*) n FROM schedule_version WHERE semester_id=?', res.semesterId)
    ).toBe(FULL_SCHOOL_EXPECTED.versions)
    expect(
      scalar(
        'SELECT COUNT(*) n FROM schedule_version WHERE semester_id=? AND is_published=1',
        res.semesterId
      )
    ).toBe(1)
    expect(
      scalar(
        'SELECT COUNT(*) n FROM schedule_version WHERE semester_id=? AND hard_violations<>0',
        res.semesterId
      )
    ).toBe(0)
    const versionMetrics = db
      .prepare('SELECT metrics FROM schedule_version WHERE semester_id=? ORDER BY id')
      .all(res.semesterId) as { metrics: string }[]
    expect(versionMetrics.map((row) => JSON.parse(row.metrics).usedFallback)).toEqual([
      false,
      false,
      false
    ])
    expect(
      scalar(
        `SELECT MIN(n) n FROM (
             SELECT COUNT(*) n FROM lesson l JOIN schedule_version v ON v.id=l.version_id
              WHERE v.semester_id=? GROUP BY v.id
           )`,
        res.semesterId
      )
    ).toBe(FULL_SCHOOL_EXPECTED.rawTaskPeriods)
  }, 60_000)
})
