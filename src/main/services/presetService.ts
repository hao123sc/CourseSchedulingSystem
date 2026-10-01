import { getDb } from '../db/connection'
import { buildSolverInput } from './solverInputService'
import { saveSchedule } from './scheduleResultService'
import { solve, toPlacedLessons } from '@solver/solve'
import { CURRICULUM_PRESETS } from '@shared/curriculumPresets'
import type { PresetCode, PresetLoadResult } from '@shared/types/ipc'
import { loadFullSchoolPreset } from './fullSchoolPresetService'

interface StageConfig {
  id: number
  code: string
  name: string
  enabled: boolean
  periodsPerDay: number
  daysPerWeek: number
  morningPeriods: number
  afternoonPeriods: number
  nightPeriods: number
}

const FIRST_NAMES = [
  '伟',
  '芳',
  '娜',
  '秀英',
  '敏',
  '静',
  '丽',
  '强',
  '磊',
  '军',
  '洋',
  '勇',
  '艳',
  '杰',
  '娟',
  '涛',
  '明',
  '超',
  '秀兰',
  '霞',
  '平',
  '刚',
  '桂英',
  '英',
  '华',
  '婷',
  '慧',
  '巧',
  '美',
  '玲'
]
const SURNAMES = [
  '李',
  '王',
  '张',
  '刘',
  '陈',
  '杨',
  '赵',
  '黄',
  '周',
  '吴',
  '徐',
  '孙',
  '胡',
  '朱',
  '高',
  '林',
  '何',
  '郭',
  '马',
  '罗'
]

function generateTeacherNames(count: number): string[] {
  const names: string[] = []
  let idx = 0
  for (const s of SURNAMES) {
    for (const f of FIRST_NAMES) {
      names.push(`${s}${f}`)
      idx++
      if (idx >= count) return names
    }
  }
  // 如果还不够，追加编号
  while (names.length < count) {
    names.push(`教师${names.length + 1}`)
  }
  return names
}

export function loadPreset(preset: PresetCode): PresetLoadResult {
  // stress 不再使用旧的“6 年级 × 12 班”伪压力数据，而是真正加载
  // 12 年级 × 20 班的十二年一贯制全功能黄金数据。
  if (preset === 'stress') return loadFullSchoolPreset()

  const db = getDb()

  const tx = db.transaction(() => {
    // 1. 清空当前所有业务数据（保留内置字典阶段与学科）
    db.prepare('DELETE FROM adjust_log').run()
    db.prepare('DELETE FROM lesson').run()
    db.prepare('DELETE FROM schedule_version').run()
    db.prepare('DELETE FROM fixed_lesson').run()
    db.prepare('DELETE FROM time_rule').run()
    db.prepare('DELETE FROM subject_classroom').run()
    db.prepare('DELETE FROM group_member').run()
    db.prepare('DELETE FROM constraint_group').run()
    db.prepare('DELETE FROM teaching_task').run()
    db.prepare('DELETE FROM klass').run()
    db.prepare('DELETE FROM grade').run()
    db.prepare('DELETE FROM classroom').run()
    db.prepare('DELETE FROM teacher_subject').run()
    db.prepare('DELETE FROM teacher').run()
    db.prepare('DELETE FROM semester').run()
    // 预设载入是全量覆盖操作；清掉上一套全功能数据增加的学段专属实验学科，
    // 避免它们污染普通预设的学科列表和轮转教师资格。
    db.prepare('DELETE FROM subject WHERE stage_id IS NOT NULL').run()

    // 2. 配置学校与学期
    let schoolName = '阳光实验完全中学'
    let schoolType = 'complete'

    if (preset === 'junior') {
      schoolName = '阳光实验初级中学'
      schoolType = 'junior'
    } else if (preset === 'senior') {
      schoolName = '阳光实验高级中学'
      schoolType = 'senior'
    } else if (preset === 'primary') {
      schoolName = '阳光实验小学'
      schoolType = 'primary'
    }

    db.prepare(`INSERT OR REPLACE INTO school (id, name, school_type) VALUES (1, ?, ?)`).run(
      schoolName,
      schoolType
    )

    const insSem = db.prepare(
      `INSERT INTO semester (name, is_current, start_date, end_date)
       VALUES ('2026-2027学年第一学期', 1, '2026-09-01', '2027-01-20')`
    )
    const semesterId = Number(insSem.run().lastInsertRowid)

    // 3. 配置学段与时段
    const isPrimaryEnabled = preset === 'primary' || preset === 'complete'
    const isJuniorEnabled = preset === 'junior' || preset === 'complete'
    const isSeniorEnabled = preset === 'senior' || preset === 'complete'

    const stageConfigs: StageConfig[] = [
      {
        id: 1,
        code: 'primary',
        name: '小学部',
        enabled: isPrimaryEnabled,
        periodsPerDay: 7,
        daysPerWeek: 5,
        morningPeriods: 4,
        afternoonPeriods: 3,
        nightPeriods: 0
      },
      {
        id: 2,
        code: 'junior',
        name: '初中部',
        enabled: isJuniorEnabled,
        periodsPerDay: 8,
        daysPerWeek: 5,
        morningPeriods: 5,
        afternoonPeriods: 3,
        nightPeriods: 0
      },
      {
        id: 3,
        code: 'senior',
        name: '高中部',
        enabled: isSeniorEnabled,
        periodsPerDay: 13,
        daysPerWeek: 5,
        morningPeriods: 5,
        afternoonPeriods: 4,
        nightPeriods: 3
      }
    ]

    // 高完中不开启小学部，只启用初中和高中。
    if (preset === 'complete') {
      stageConfigs[0].enabled = false
      stageConfigs[1].enabled = true
      stageConfigs[2].enabled = true
    }

    for (const sc of stageConfigs) {
      db.prepare(
        `UPDATE stage SET enabled = ?, days_per_week = ?, has_evening = ? WHERE id = ?`
      ).run(sc.enabled ? 1 : 0, sc.daysPerWeek, sc.nightPeriods > 0 ? 1 : 0, sc.id)
      // 重新生成作息表 time_slot
      db.prepare(`DELETE FROM time_slot WHERE stage_id = ?`).run(sc.id)
      if (sc.enabled) {
        let order = 1
        for (let d = 1; d <= sc.daysPerWeek; d++) {
          if (sc.code === 'primary') {
            for (let p = 1; p <= 7; p++) {
              const seg = p <= 4 ? 'morning' : 'afternoon'
              db.prepare(
                `INSERT INTO time_slot (stage_id, day_of_week, period_index, period_name, start_time, end_time, segment, is_teaching, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
              ).run(sc.id, d, p, `第${p}节`, `${7 + p}:00`, `${7 + p}:40`, seg, order++)
            }
          } else if (sc.code === 'junior') {
            for (let p = 1; p <= 8; p++) {
              const seg = p <= 5 ? 'morning' : 'afternoon'
              db.prepare(
                `INSERT INTO time_slot (stage_id, day_of_week, period_index, period_name, start_time, end_time, segment, is_teaching, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
              ).run(sc.id, d, p, `第${p}节`, `${7 + p}:00`, `${7 + p}:45`, seg, order++)
            }
          } else if (sc.code === 'senior') {
            // 早读
            db.prepare(
              `INSERT INTO time_slot (stage_id, day_of_week, period_index, period_name, start_time, end_time, segment, is_teaching, sort_order)
               VALUES (?, ?, 0, '早读', '07:30', '08:00', 'morning', 1, ?)`
            ).run(sc.id, d, order++)
            // 上午 1~5
            for (let p = 1; p <= 5; p++) {
              db.prepare(
                `INSERT INTO time_slot (stage_id, day_of_week, period_index, period_name, start_time, end_time, segment, is_teaching, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, 'morning', 1, ?)`
              ).run(sc.id, d, p, `第${p}节`, `${7 + p}:10`, `${7 + p}:55`, order++)
            }
            // 下午 6~9
            for (let p = 6; p <= 9; p++) {
              db.prepare(
                `INSERT INTO time_slot (stage_id, day_of_week, period_index, period_name, start_time, end_time, segment, is_teaching, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, 'afternoon', 1, ?)`
              ).run(sc.id, d, p, `第${p}节`, `${8 + p}:00`, `${8 + p}:45`, order++)
            }
            // 晚自习 10~12
            for (let p = 10; p <= 12; p++) {
              db.prepare(
                `INSERT INTO time_slot (stage_id, day_of_week, period_index, period_name, start_time, end_time, segment, is_teaching, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, 'evening', 1, ?)`
              ).run(sc.id, d, p, `晚自习${p - 9}`, `${9 + p}:00`, `${9 + p}:45`, order++)
            }
          }
        }
      }
    }

    // 4. 准备学科库
    const subjects = db.prepare(`SELECT id, name, category, stage_id FROM subject`).all() as {
      id: number
      name: string
      category: string
      stage_id: number | null
    }[]
    const subjectMap = new Map<string, number>()
    subjects.forEach((s) => subjectMap.set(s.name, s.id))

    // 5. 教师池与教室场地
    let teacherCount = 60
    let classesPerGrade = 6

    if (preset === 'complete') {
      teacherCount = 90
      classesPerGrade = 6
    } else if (preset === 'primary') {
      teacherCount = 60
      classesPerGrade = 6
    }

    const teacherNames = generateTeacherNames(teacherCount)
    const insTeacher = db.prepare(
      `INSERT INTO teacher (name, staff_no, max_weekly_periods, enabled)
       VALUES (?, ?, 18, 1)`
    )
    const insTeacherSubject = db.prepare(
      `INSERT INTO teacher_subject (teacher_id, subject_id) VALUES (?, ?)`
    )

    const teacherIds: number[] = []
    teacherNames.forEach((name, i) => {
      const staffNo = `T${String(i + 1).padStart(4, '0')}`
      const subjId = subjects[i % subjects.length]?.id ?? 1
      const res = insTeacher.run(name, staffNo)
      const tId = Number(res.lastInsertRowid)
      insTeacherSubject.run(tId, subjId)
      teacherIds.push(tId)
    })

    // 专用教室与普通教室
    const insRoom = db.prepare(
      `INSERT INTO classroom (name, room_type, capacity, concurrent_capacity, building, enabled)
       VALUES (?, ?, ?, ?, ?, 1)`
    )

    // 专用教室
    const specialRooms: { name: string; type: string; cap: number; con: number }[] = [
      { name: '物理实验室 1', type: 'lab', cap: 50, con: 1 },
      { name: '物理实验室 2', type: 'lab', cap: 50, con: 1 },
      { name: '化学实验室 1', type: 'lab', cap: 50, con: 1 },
      { name: '化学实验室 2', type: 'lab', cap: 50, con: 1 },
      { name: '生物实验室 1', type: 'lab', cap: 50, con: 1 },
      { name: '计算机教室 1', type: 'computer', cap: 60, con: 1 },
      { name: '计算机教室 2', type: 'computer', cap: 60, con: 1 },
      { name: '音乐教室 1', type: 'music', cap: 50, con: 1 },
      { name: '美术教室 1', type: 'art', cap: 50, con: 1 },
      { name: '通用技术教室 1', type: 'other', cap: 50, con: 1 },
      { name: '田径场', type: 'sports', cap: 240, con: 4 },
      { name: '室内体育馆', type: 'sports', cap: 120, con: 2 }
    ]

    const specialRoomIds = new Map<string, number>()
    const insSubjRoom = db.prepare(
      `INSERT INTO subject_classroom (subject_id, classroom_id, slots_taken, priority) VALUES (?, ?, ?, ?)`
    )

    for (const sr of specialRooms) {
      const res = insRoom.run(sr.name, sr.type, sr.cap, sr.con, '实验综合楼')
      const roomId = Number(res.lastInsertRowid)
      specialRoomIds.set(sr.name, roomId)

      if (sr.type === 'sports' && subjectMap.has('体育')) {
        insSubjRoom.run(subjectMap.get('体育')!, roomId, 1, 0)
      } else if (sr.type === 'computer' && subjectMap.has('信息技术')) {
        insSubjRoom.run(subjectMap.get('信息技术')!, roomId, 1, 0)
      } else if (sr.type === 'music' && subjectMap.has('音乐')) {
        insSubjRoom.run(subjectMap.get('音乐')!, roomId, 1, 0)
      } else if (sr.type === 'art' && subjectMap.has('美术')) {
        insSubjRoom.run(subjectMap.get('美术')!, roomId, 1, 0)
      }
    }

    // 6. 年级与班级
    const gradesToCreate: { name: string; stageId: number; planCode: string }[] = []
    if (preset === 'primary') {
      gradesToCreate.push(
        { name: '一年级', stageId: 1, planCode: 'primary_g1_2' },
        { name: '二年级', stageId: 1, planCode: 'primary_g1_2' },
        { name: '三年级', stageId: 1, planCode: 'primary_g3_6' },
        { name: '四年级', stageId: 1, planCode: 'primary_g3_6' },
        { name: '五年级', stageId: 1, planCode: 'primary_g3_6' },
        { name: '六年级', stageId: 1, planCode: 'primary_g3_6' }
      )
    } else if (preset === 'junior') {
      gradesToCreate.push(
        { name: '初一', stageId: 2, planCode: 'junior_g7' },
        { name: '初二', stageId: 2, planCode: 'junior_g8' },
        { name: '初三', stageId: 2, planCode: 'junior_g9' }
      )
    } else if (preset === 'senior') {
      gradesToCreate.push(
        { name: '高一', stageId: 3, planCode: 'senior_g1' },
        { name: '高二', stageId: 3, planCode: 'senior_g2' },
        { name: '高三', stageId: 3, planCode: 'senior_g3' }
      )
    } else {
      // complete
      gradesToCreate.push(
        { name: '初一', stageId: 2, planCode: 'junior_g7' },
        { name: '初二', stageId: 2, planCode: 'junior_g8' },
        { name: '初三', stageId: 2, planCode: 'junior_g9' },
        { name: '高一', stageId: 3, planCode: 'senior_g1' },
        { name: '高二', stageId: 3, planCode: 'senior_g2' },
        { name: '高三', stageId: 3, planCode: 'senior_g3' }
      )
    }

    const insGrade = db.prepare(
      `INSERT INTO grade (semester_id, stage_id, name, enroll_year, sort_order)
       VALUES (?, ?, ?, 2026, ?)`
    )
    const insClass = db.prepare(
      `INSERT INTO klass (grade_id, name, short_name, student_count, home_room_id, head_teacher_id, is_virtual, sort_order)
       VALUES (?, ?, ?, 45, ?, ?, 0, ?)`
    )
    const insTask = db.prepare(
      `INSERT INTO teaching_task (semester_id, class_id, subject_id, teacher_id, weekly_periods, consecutive_count, consecutive_size, week_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'all')`
    )

    let teacherPointer = 0
    let classSeq = 1

    for (let gIdx = 0; gIdx < gradesToCreate.length; gIdx++) {
      const gConfig = gradesToCreate[gIdx]
      const gRes = insGrade.run(semesterId, gConfig.stageId, gConfig.name, gIdx + 1)
      const gradeId = Number(gRes.lastInsertRowid)

      const plan =
        CURRICULUM_PRESETS.find((p) => p.code === gConfig.planCode) ?? CURRICULUM_PRESETS[0]

      for (let c = 1; c <= classesPerGrade; c++) {
        const className = `${gConfig.name}(${c})班`
        const shortName = `${gConfig.name}${c}`
        const roomRes = insRoom.run(`${className}固定教室`, 'normal', 50, 1, '综合教学楼')
        const homeRoomId = Number(roomRes.lastInsertRowid)
        const headTeacherId = teacherIds[teacherPointer % teacherIds.length]

        const cRes = insClass.run(
          gradeId,
          className,
          shortName,
          homeRoomId,
          headTeacherId,
          classSeq++
        )
        const classId = Number(cRes.lastInsertRowid)

        // 写入教学任务
        for (const entry of plan.entries) {
          if (entry.subject === '班会') continue // 班会由预排承担
          const sId = subjectMap.get(entry.subject)
          if (!sId) continue

          const tId = teacherIds[teacherPointer % teacherIds.length]
          teacherPointer++

          const isConsecutive =
            (entry.subject === '语文' || entry.subject === '物理' || entry.subject === '化学') &&
            entry.periods >= 4

          insTask.run(
            semesterId,
            classId,
            sId,
            tId,
            entry.periods,
            isConsecutive ? 1 : 0,
            isConsecutive ? 2 : 1
          )
        }
      }
    }

    // 7. 预排锁定课程 (班会、升旗、早读、晚自习)
    const allSlots = db
      .prepare(`SELECT id, stage_id, day_of_week, period_index, segment FROM time_slot`)
      .all() as {
      id: number
      stage_id: number
      day_of_week: number
      period_index: number
      segment: string
    }[]

    const insFixed = db.prepare(
      `INSERT INTO fixed_lesson (semester_id, class_id, grade_id, teacher_id, classroom_id, slot_id, subject_id, kind, label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    // 周一第1节升旗仪式 (占位)
    const mondayP1Slots = allSlots.filter((s) => s.day_of_week === 1 && s.period_index === 1)
    mondayP1Slots.forEach((slot) => {
      insFixed.run(semesterId, null, null, null, null, slot.id, null, 'block', '升旗仪式')
    })

    return { semesterId }
  })

  const { semesterId } = tx()

  // 8. 自动执行一次排课求解并落库初版课表
  let versionId: number | null = null
  try {
    const solverInput = buildSolverInput(semesterId)
    const solveRes = solve(solverInput, { starts: 2, timeBudgetMs: 4000 })
    if (solveRes.status === 'solved' || solveRes.status === 'partial') {
      const placed = toPlacedLessons(solveRes.ctx, solveRes.solution)
      const saveRes = saveSchedule({
        semesterId,
        weightProfileCode: 'balanced',
        solveMs: 1200,
        hardViolations: solveRes.violations.length,
        lessons: placed
      })
      versionId = saveRes.versionId
      // 设为发布版本
      db.prepare(`UPDATE schedule_version SET is_published = 1 WHERE id = ?`).run(versionId)
    }
  } catch (err) {
    console.error('自动求解示范排课失败:', err)
  }

  return {
    success: true,
    message: `已成功载入「${preset}」示范全套数据并生成基准课表！`,
    semesterId,
    versionId
  }
}
