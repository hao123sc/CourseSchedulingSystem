import { describe, expect, it } from 'vitest'
import { validateSolverInput } from './validate'
import type { SolverInput } from './types'

/** 最小可行输入：1 学段 × 10 时段、1 年级 2 班、2 教师、2 学科 */
function baseInput(): SolverInput {
  const slots = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    stageId: 1,
    dayOfWeek: Math.floor(i / 2) + 1,
    periodIndex: (i % 2) + 1,
    periodName: `第${(i % 2) + 1}节`,
    segment: 'morning' as const,
    isTeaching: true,
    sortOrder: i
  }))
  return {
    semesterId: 1,
    semesterName: '测试学期',
    generatedAt: '2026-09-29T00:00:00.000Z',
    weightProfileCode: 'balanced',
    weights: { S1: 40 },
    stages: [
      {
        id: 1,
        code: 'junior',
        name: '初中',
        daysPerWeek: 5,
        hasEvening: false,
        slotIds: slots.map((s) => s.id)
      }
    ],
    slots,
    grades: [{ id: 1, stageId: 1, name: '初一', classIds: [11, 12] }],
    classes: [
      { id: 11, gradeId: 1, stageId: 1, name: '初一(1)班', studentCount: 45, homeRoomId: 901 },
      { id: 12, gradeId: 1, stageId: 1, name: '初一(2)班', studentCount: 45, homeRoomId: 902 }
    ],
    teachers: [
      { id: 101, name: '张明', maxWeeklyPeriods: 18, building: 'A', subjectIds: [1] },
      { id: 102, name: '李红', maxWeeklyPeriods: 18, building: 'A', subjectIds: [2] }
    ],
    subjects: [
      {
        id: 1,
        name: '语文',
        shortName: '语',
        importance: 5,
        needSpecialRoom: false,
        dailyMax: 2,
        weekSpread: 'spread',
        allowedRooms: []
      },
      {
        id: 2,
        name: '数学',
        shortName: '数',
        importance: 5,
        needSpecialRoom: false,
        dailyMax: 2,
        weekSpread: 'spread',
        allowedRooms: []
      }
    ],
    rooms: [
      {
        id: 901,
        name: '初一(1)班教室',
        roomType: 'normal',
        capacity: 50,
        concurrentCapacity: 1,
        building: 'A'
      },
      {
        id: 902,
        name: '初一(2)班教室',
        roomType: 'normal',
        capacity: 50,
        concurrentCapacity: 1,
        building: 'A'
      }
    ],
    tasks: [
      {
        id: 1,
        classId: 11,
        subjectId: 1,
        teacherId: 101,
        weeklyPeriods: 4,
        consecutiveCount: 0,
        consecutiveSize: 2,
        weekMode: 'all',
        mergeGroupId: null,
        fixedRoomId: null
      },
      {
        id: 2,
        classId: 12,
        subjectId: 2,
        teacherId: 102,
        weeklyPeriods: 4,
        consecutiveCount: 0,
        consecutiveSize: 2,
        weekMode: 'all',
        mergeGroupId: null,
        fixedRoomId: null
      }
    ],
    timeRules: [],
    fixedLessons: [],
    constraintGroups: [],
    roomCoexistRules: []
  }
}

const codes = (input: SolverInput): string[] =>
  validateSolverInput(input).issues.map((i) => i.code)

describe('SolverInput 自检', () => {
  it('齐备的输入通过，统计数字正确', () => {
    const r = validateSolverInput(baseInput())
    expect(r.ok).toBe(true)
    expect(r.stats.classes).toBe(2)
    expect(r.stats.tasks).toBe(2)
    expect(r.stats.totalPeriods).toBe(8)
    expect(r.stats.unassignedTasks).toBe(0)
    expect(r.issues.filter((i) => i.level === 'error')).toHaveLength(0)
  })

  it('未指派教师 → TASK_NO_TEACHER 错误', () => {
    const input = baseInput()
    input.tasks[0].teacherId = null
    const r = validateSolverInput(input)
    expect(r.ok).toBe(false)
    expect(r.stats.unassignedTasks).toBe(1)
    expect(r.issues.map((i) => i.code)).toContain('TASK_NO_TEACHER')
  })

  it('教师未登记该学科 → 只给 warn，不阻断', () => {
    const input = baseInput()
    input.tasks[0].teacherId = 102 // 李红只教数学，却被派了语文
    const r = validateSolverInput(input)
    expect(r.issues.some((i) => i.code === 'TASK_TEACHER_SUBJECT' && i.level === 'warn')).toBe(true)
    expect(r.ok).toBe(true)
  })

  it('班级课时超过学段可排时段 → CLASS_OVERLOAD', () => {
    const input = baseInput()
    input.tasks[0].weeklyPeriods = 40
    expect(codes(input)).toContain('CLASS_OVERLOAD')
  })

  it('预排占位计入班级课时容量', () => {
    const input = baseInput()
    input.tasks[0].weeklyPeriods = 10 // 恰好占满 10 个时段
    expect(codes(input)).not.toContain('CLASS_OVERLOAD')
    input.fixedLessons = [
      {
        id: 1,
        classId: 11,
        gradeId: null,
        subjectId: null,
        teacherId: null,
        classroomId: null,
        slotId: 1,
        label: '升旗'
      }
    ]
    expect(codes(input)).toContain('CLASS_OVERLOAD')
  })

  it('教师超工作量上限 → TEACHER_OVERLOAD', () => {
    const input = baseInput()
    input.teachers[0].maxWeeklyPeriods = 3
    expect(codes(input)).toContain('TEACHER_OVERLOAD')
  })

  it('连堂需求超过周课时 → TASK_CONSECUTIVE', () => {
    const input = baseInput()
    input.tasks[0].consecutiveCount = 3
    input.tasks[0].consecutiveSize = 2 // 6 > 4
    expect(codes(input)).toContain('TASK_CONSECUTIVE')
  })

  it('禁排把班级堵死 → CLASS_FORBIDDEN_TOO_MANY', () => {
    const input = baseInput()
    // 10 个时段禁掉 8 个，只剩 2 个，排不下 4 节
    input.timeRules = [1, 2, 3, 4, 5, 6, 7, 8].map((slotId) => ({
      scopeType: 'class' as const,
      scopeId: 11,
      slotId,
      ruleValue: 'FORBIDDEN' as const
    }))
    expect(codes(input)).toContain('CLASS_FORBIDDEN_TOO_MANY')
  })

  it('AVOID 不算堵死，只有 FORBIDDEN 才扣可用时段', () => {
    const input = baseInput()
    input.timeRules = [1, 2, 3, 4, 5, 6, 7, 8].map((slotId) => ({
      scopeType: 'class' as const,
      scopeId: 11,
      slotId,
      ruleValue: 'AVOID' as const
    }))
    expect(codes(input)).not.toContain('CLASS_FORBIDDEN_TOO_MANY')
  })

  it('全局禁排同样计入教师可用时段', () => {
    const input = baseInput()
    input.timeRules = [1, 2, 3, 4, 5, 6, 7].map((slotId) => ({
      scopeType: 'global' as const,
      scopeId: null,
      slotId,
      ruleValue: 'FORBIDDEN' as const
    }))
    expect(codes(input)).toContain('TEACHER_FORBIDDEN_TOO_MANY')
  })

  it('需专用教室却没绑场地 → SUBJECT_NO_ROOM（只对在用学科报错）', () => {
    const input = baseInput()
    input.subjects[0].needSpecialRoom = true
    expect(codes(input)).toContain('SUBJECT_NO_ROOM')

    // 未被任何任务使用的学科不报错
    const input2 = baseInput()
    input2.subjects.push({
      id: 3,
      name: '音乐',
      shortName: '音',
      importance: 1,
      needSpecialRoom: true,
      dailyMax: 1,
      weekSpread: 'spread',
      allowedRooms: []
    })
    expect(codes(input2)).not.toContain('SUBJECT_NO_ROOM')
  })

  it('预排占位引用不存在的时段 → FIXED_SLOT_MISSING', () => {
    const input = baseInput()
    input.fixedLessons = [
      {
        id: 1,
        classId: 11,
        gradeId: null,
        subjectId: null,
        teacherId: null,
        classroomId: null,
        slotId: 9999,
        label: '幽灵占位'
      }
    ]
    expect(codes(input)).toContain('FIXED_SLOT_MISSING')
  })

  it('约束组成员失效 / 人数不足 → warn', () => {
    const input = baseInput()
    input.constraintGroups = [
      {
        id: 1,
        groupType: 'teacher_mutex',
        name: '孤零零的组',
        hardness: 'hard',
        maxConcurrent: null,
        scopeNote: null,
        members: [{ memberType: 'teacher', memberId: 999 }]
      }
    ]
    const c = codes(input)
    expect(c).toContain('GROUP_TOO_SMALL')
    expect(c).toContain('GROUP_MEMBER_MISSING')
    expect(validateSolverInput(input).ok).toBe(true) // 只是提醒，不阻断
  })

  it('没有班级 / 任务 / 时段时报致命错误', () => {
    const empty: SolverInput = {
      ...baseInput(),
      classes: [],
      tasks: [],
      slots: [],
      stages: []
    }
    const c = codes(empty)
    expect(c).toContain('NO_CLASS')
    expect(c).toContain('NO_TASK')
    expect(c).toContain('NO_SLOT')
  })
})
