import { describe, expect, it } from 'vitest'
import {
  buildSingleTimetableExportSheet,
  type ExportMetaContext
} from '@shared/timetableExport'
import type {
  Classroom,
  FixedLesson,
  Grade,
  Klass,
  Lesson,
  Subject,
  Teacher,
  TimeSlot
} from '@shared/types/entities'

const mockSubjects: Subject[] = [
  {
    id: 1,
    name: '语文',
    shortName: '语',
    color: '#ef4444',
    category: 'main',
    importance: 5,
    needSpecialRoom: false,
    stageId: 2,
    dailyMax: 2,
    weekSpread: 'spread',
    sortOrder: 1
  },
  {
    id: 2,
    name: '数学',
    shortName: '数',
    color: '#3b82f6',
    category: 'main',
    importance: 5,
    needSpecialRoom: false,
    stageId: 2,
    dailyMax: 2,
    weekSpread: 'spread',
    sortOrder: 2
  },
  {
    id: 3,
    name: '物理实验',
    shortName: '物实',
    color: '#8b5cf6',
    category: 'minor',
    importance: 4,
    needSpecialRoom: true,
    stageId: 2,
    dailyMax: 1,
    weekSpread: 'spread',
    sortOrder: 3
  }
]

const mockTeachers: Teacher[] = [
  {
    id: 101,
    name: '高静',
    staffNo: 'T054',
    phone: null,
    maxWeeklyPeriods: 16,
    building: null,
    enabled: true,
    subjectIds: [1]
  },
  {
    id: 102,
    name: '李伟',
    staffNo: 'T001',
    phone: null,
    maxWeeklyPeriods: 16,
    building: null,
    enabled: true,
    subjectIds: [2]
  }
]

const mockClassrooms: Classroom[] = [
  {
    id: 201,
    name: '101教室',
    roomType: 'normal',
    capacity: 50,
    concurrentCapacity: 1,
    building: '教学楼A',
    enabled: true
  },
  {
    id: 202,
    name: '物理实验室(1)',
    roomType: 'lab',
    capacity: 50,
    concurrentCapacity: 1,
    building: '实验楼',
    enabled: true
  }
]

const mockGrades: Grade[] = [
  { id: 10, semesterId: 1, stageId: 2, name: '初一', enrollYear: 2026, sortOrder: 1 }
]

const mockClasses: Klass[] = [
  {
    id: 301,
    gradeId: 10,
    name: '初一(1)班',
    shortName: '初一1',
    studentCount: 45,
    isVirtual: false,
    homeRoomId: 201,
    headTeacherId: 101,
    sortOrder: 1
  },
  {
    id: 302,
    gradeId: 10,
    name: '初一(2)班',
    shortName: '初一2',
    studentCount: 45,
    isVirtual: false,
    homeRoomId: 201,
    headTeacherId: 102,
    sortOrder: 2
  }
]

const mockSlots: TimeSlot[] = [
  // 周一: 上午 1, 2; 下午 3, 4
  {
    id: 1,
    stageId: 2,
    dayOfWeek: 1,
    periodIndex: 1,
    periodName: '第1节',
    startTime: '08:00',
    endTime: '08:45',
    segment: 'morning',
    isTeaching: true,
    sortOrder: 1
  },
  {
    id: 2,
    stageId: 2,
    dayOfWeek: 1,
    periodIndex: 2,
    periodName: '第2节',
    startTime: '08:55',
    endTime: '09:40',
    segment: 'morning',
    isTeaching: true,
    sortOrder: 2
  },
  {
    id: 3,
    stageId: 2,
    dayOfWeek: 1,
    periodIndex: 3,
    periodName: '第3节',
    startTime: '14:00',
    endTime: '14:45',
    segment: 'afternoon',
    isTeaching: true,
    sortOrder: 3
  },
  {
    id: 4,
    stageId: 2,
    dayOfWeek: 1,
    periodIndex: 4,
    periodName: '第4节',
    startTime: '14:55',
    endTime: '15:40',
    segment: 'afternoon',
    isTeaching: true,
    sortOrder: 4
  }
]

const metaContext: ExportMetaContext = {
  schoolName: '智课排十二年一贯制实验学校（全功能测试校）',
  semesterName: '2026-2027学年第一学期',
  versionName: '自动排课 #1 · 均衡档',
  subjects: mockSubjects,
  teachers: mockTeachers,
  classrooms: mockClassrooms,
  classes: mockClasses,
  grades: mockGrades
}

describe('timetablePrint · 导出中心课表打印与单页 A4 组装测试', () => {
  const mockLessons: Lesson[] = [
    {
      id: 1,
      versionId: 1,
      taskId: 1,
      classId: 301,
      subjectId: 1,
      teacherId: 101,
      classroomId: 201,
      slotId: 1,
      weekMode: 'all',
      isLocked: false,
      consecutiveGroup: null,
      remark: null
    },
    {
      id: 2,
      versionId: 1,
      taskId: 2,
      classId: 301,
      subjectId: 2,
      teacherId: 102,
      classroomId: 201,
      slotId: 2,
      weekMode: 'all',
      isLocked: true,
      consecutiveGroup: null,
      remark: null
    },
    {
      id: 3,
      versionId: 1,
      taskId: 3,
      classId: 301,
      subjectId: 3,
      teacherId: 101,
      classroomId: 202,
      slotId: 3,
      weekMode: 'all',
      isLocked: false,
      consecutiveGroup: null,
      remark: null
    }
  ]

  const mockFixed: FixedLesson[] = []

  it('builds printable class timetable sheet with full period rows, divider and metadata', () => {
    const sheet = buildSingleTimetableExportSheet({
      view: 'class',
      targetId: 301,
      slots: mockSlots,
      lessons: mockLessons,
      fixedLessons: mockFixed,
      meta: metaContext
    })

    expect(sheet).toBeDefined()
    expect(sheet.viewType).toBe('class')
    expect(sheet.targetName).toBe('初一(1)班')
    expect(sheet.title).toContain('初一(1)班')
    expect(sheet.stats.totalLessons).toBe(3)
    expect(sheet.stats.lockedLessons).toBe(1)
    expect(sheet.days).toContain(1)

    // Check rows: should have 4 periods and a divider before afternoon period
    expect(sheet.rows).toHaveLength(4)
    const p3Row = sheet.rows.find((r) => r.periodIndex === 3)
    expect(p3Row?.dividerBefore).toContain('午休')

    // Check cell item contents for class view
    const p1Row = sheet.rows.find((r) => r.periodIndex === 1)
    const p1Cell = p1Row?.cellsByDay.get(1)
    expect(p1Cell?.items).toHaveLength(1)
    expect(p1Cell?.items[0].subjectName).toBe('语文')
    expect(p1Cell?.items[0].teacherName).toBe('高静')
    expect(p1Cell?.items[0].roomName).toBe('101教室')
  })

  it('builds printable teacher timetable sheet with teacher workload stats and classes', () => {
    const sheet = buildSingleTimetableExportSheet({
      view: 'teacher',
      targetId: 101, // 高静
      slots: mockSlots,
      lessons: mockLessons,
      fixedLessons: mockFixed,
      meta: metaContext
    })

    expect(sheet).toBeDefined()
    expect(sheet.viewType).toBe('teacher')
    expect(sheet.targetName).toBe('高静')
    expect(sheet.title).toContain('高静')
    expect(sheet.stats.totalLessons).toBe(2) // slot 1 & slot 3

    const p1Row = sheet.rows.find((r) => r.periodIndex === 1)
    const p1Cell = p1Row?.cellsByDay.get(1)
    expect(p1Cell?.items[0].className).toBe('初一(1)班')
    expect(p1Cell?.items[0].subjectName).toBe('语文')
  })

  it('builds printable room timetable sheet with room occupancy and subjects', () => {
    const sheet = buildSingleTimetableExportSheet({
      view: 'room',
      targetId: 202, // 物理实验室(1)
      slots: mockSlots,
      lessons: mockLessons,
      fixedLessons: mockFixed,
      meta: metaContext
    })

    expect(sheet).toBeDefined()
    expect(sheet.viewType).toBe('room')
    expect(sheet.targetName).toBe('物理实验室(1)')
    expect(sheet.stats.totalLessons).toBe(1) // slot 3

    const p3Row = sheet.rows.find((r) => r.periodIndex === 3)
    const p3Cell = p3Row?.cellsByDay.get(1)
    expect(p3Cell?.items[0].subjectName).toBe('物理实验')
    expect(p3Cell?.items[0].className).toBe('初一(1)班')
  })

  it('supports batch generation of multiple sheets for selective or full school printing', () => {
    const classIds = [301, 302]
    const sheets = classIds.map((cid) =>
      buildSingleTimetableExportSheet({
        view: 'class',
        targetId: cid,
        slots: mockSlots,
        lessons: mockLessons,
        fixedLessons: mockFixed,
        meta: metaContext
      })
    )

    expect(sheets).toHaveLength(2)
    expect(sheets[0].targetName).toBe('初一(1)班')
    expect(sheets[1].targetName).toBe('初一(2)班')
    expect(sheets[0].stats.totalLessons).toBe(3)
    expect(sheets[1].stats.totalLessons).toBe(0)
  })
})
