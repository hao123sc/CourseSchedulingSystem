/**
 * 单元测试用的小算例构造器（仅测试使用，不打包进产品）。
 *
 * 默认是一所袖珍学校：1 个学段、5 天 × 4 节（上午 2 节 + 下午 2 节）、
 * 2 个班、2 位教师、2 个学科、2 间教室。各用例在此基础上按需覆盖，
 * 让「违反哪条硬约束」一眼能看出来。
 */
import type {
  SolverClass,
  SolverGrade,
  SolverInput,
  SolverRoom,
  SolverSlot,
  SolverStage,
  SolverSubject,
  SolverTask,
  SolverTeacher
} from '../model/types'

export interface FixtureOptions {
  days?: number
  periodsPerDay?: number
  classes?: number
  /** 每班每科周课时 */
  weeklyPeriods?: number
}

export function makeSlots(days: number, periodsPerDay: number, stageId = 1): SolverSlot[] {
  const slots: SolverSlot[] = []
  let id = 1
  for (let d = 1; d <= days; d++) {
    for (let p = 1; p <= periodsPerDay; p++) {
      slots.push({
        id: id++,
        stageId,
        dayOfWeek: d,
        periodIndex: p,
        periodName: `第${p}节`,
        segment: p <= Math.ceil(periodsPerDay / 2) ? 'morning' : 'afternoon',
        isTeaching: true,
        sortOrder: (d - 1) * periodsPerDay + p
      })
    }
  }
  return slots
}

export function makeInput(opts: FixtureOptions = {}): SolverInput {
  const days = opts.days ?? 5
  const periodsPerDay = opts.periodsPerDay ?? 4
  const classCount = opts.classes ?? 2
  const weekly = opts.weeklyPeriods ?? 2

  const slots = makeSlots(days, periodsPerDay)
  const stage: SolverStage = {
    id: 1,
    code: 'junior',
    name: '初中部',
    daysPerWeek: days,
    hasEvening: false,
    slotIds: slots.map((s) => s.id)
  }
  const rooms: SolverRoom[] = [
    { id: 101, name: '教室一', roomType: 'normal', capacity: 60, concurrentCapacity: 1, building: 'A' },
    { id: 102, name: '教室二', roomType: 'normal', capacity: 60, concurrentCapacity: 1, building: 'A' },
    { id: 201, name: '操场', roomType: 'sports', capacity: 300, concurrentCapacity: 2, building: null }
  ]
  const classes: SolverClass[] = Array.from({ length: classCount }, (_, i) => ({
    id: 1 + i,
    gradeId: 1,
    stageId: 1,
    name: `初一(${i + 1})班`,
    studentCount: 45,
    homeRoomId: 101 + i
  }))
  const grades: SolverGrade[] = [
    { id: 1, stageId: 1, name: '初一', classIds: classes.map((c) => c.id) }
  ]
  const subjects: SolverSubject[] = [
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
  ]
  const teachers: SolverTeacher[] = [
    { id: 11, name: '张老师', maxWeeklyPeriods: 20, building: 'A', subjectIds: [1] },
    { id: 12, name: '李老师', maxWeeklyPeriods: 20, building: 'A', subjectIds: [2] }
  ]
  const tasks: SolverTask[] = []
  let taskId = 1
  for (const c of classes) {
    for (const s of subjects) {
      tasks.push({
        id: taskId++,
        classId: c.id,
        subjectId: s.id,
        teacherId: s.id === 1 ? 11 : 12,
        weeklyPeriods: weekly,
        consecutiveCount: 0,
        consecutiveSize: 1,
        weekMode: 'all',
        mergeGroupId: null,
        fixedRoomId: null
      })
    }
  }

  return {
    semesterId: 1,
    semesterName: '测试学期',
    generatedAt: '2026-09-29T00:00:00.000Z',
    weightProfileCode: 'balanced',
    weights: {},
    stages: [stage],
    slots,
    grades,
    classes,
    teachers,
    subjects,
    rooms,
    tasks,
    timeRules: [],
    fixedLessons: [],
    constraintGroups: [],
    roomCoexistRules: []
  }
}
