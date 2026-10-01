import { describe, expect, it } from 'vitest'
import { buildHealthReportModel, isMainSubject } from './reportModel'
import type {
  Classroom,
  Grade,
  Klass,
  Lesson,
  Subject,
  Teacher,
  TimeSlot
} from './types/entities'

const mockSubjects: Subject[] = [
  { id: 1, name: '语文', shortName: '语', color: '#ef4444', category: 'main', importance: 5, needSpecialRoom: false, stageId: 2, dailyMax: 2, weekSpread: 'spread', sortOrder: 1 },
  { id: 2, name: '数学', shortName: '数', color: '#3b82f6', category: 'main', importance: 5, needSpecialRoom: false, stageId: 2, dailyMax: 2, weekSpread: 'spread', sortOrder: 2 },
  { id: 3, name: '美术', shortName: '美', color: '#10b981', category: 'minor', importance: 2, needSpecialRoom: true, stageId: 2, dailyMax: 1, weekSpread: 'spread', sortOrder: 3 }
]

const mockTeachers: Teacher[] = [
  { id: 101, name: '张三', staffNo: 'T001', phone: null, maxWeeklyPeriods: 16, building: null, enabled: true, subjectIds: [1] },
  { id: 102, name: '李四', staffNo: 'T002', phone: null, maxWeeklyPeriods: 16, building: null, enabled: true, subjectIds: [2] }
]

const mockClassrooms: Classroom[] = [
  { id: 201, name: '101教室', roomType: 'normal', capacity: 50, concurrentCapacity: 1, building: '教学楼', enabled: true },
  { id: 202, name: '美术专用教室', roomType: 'art', capacity: 40, concurrentCapacity: 1, building: '艺体楼', enabled: true }
]

const mockGrades: Grade[] = [
  { id: 10, semesterId: 1, stageId: 2, name: '初一', enrollYear: 2026, sortOrder: 1 }
]

const mockClasses: Klass[] = [
  { id: 301, gradeId: 10, name: '初一(1)班', shortName: '初一1', studentCount: 45, isVirtual: false, homeRoomId: 201, headTeacherId: 101, sortOrder: 1 }
]

const mockSlots: TimeSlot[] = [
  // 周一: 上午 1, 2; 下午 3, 4
  { id: 1, stageId: 2, dayOfWeek: 1, periodIndex: 1, periodName: '第1节', startTime: '08:00', endTime: '08:45', segment: 'morning', isTeaching: true, sortOrder: 1 },
  { id: 2, stageId: 2, dayOfWeek: 1, periodIndex: 2, periodName: '第2节', startTime: '08:55', endTime: '09:40', segment: 'morning', isTeaching: true, sortOrder: 2 },
  { id: 3, stageId: 2, dayOfWeek: 1, periodIndex: 3, periodName: '第3节', startTime: '14:00', endTime: '14:45', segment: 'afternoon', isTeaching: true, sortOrder: 3 },
  { id: 4, stageId: 2, dayOfWeek: 1, periodIndex: 4, periodName: '第4节', startTime: '14:55', endTime: '15:40', segment: 'afternoon', isTeaching: true, sortOrder: 4 }
]

describe('reportModel · Health Report Pure Logic', () => {
  it('correctly identifies main subjects', () => {
    expect(isMainSubject(mockSubjects[0])).toBe(true)
    expect(isMainSubject(mockSubjects[1])).toBe(true)
    expect(isMainSubject(mockSubjects[2])).toBe(false)
    expect(isMainSubject(undefined)).toBe(false)
  })

  it('builds health report model with dimensions, teacher workload, gaps, and issues', () => {
    const mockLessons: Lesson[] = [
      // 张三 周一 第1节 (上午), 第3节 (下午, 造成第2节 1 节空隙)
      { id: 1, versionId: 1, taskId: 1, classId: 301, subjectId: 1, teacherId: 101, classroomId: 201, slotId: 1, weekMode: 'all', isLocked: false, consecutiveGroup: null, remark: null },
      { id: 2, versionId: 1, taskId: 1, classId: 301, subjectId: 1, teacherId: 101, classroomId: 201, slotId: 3, weekMode: 'all', isLocked: false, consecutiveGroup: null, remark: null },
      // 李四 周一 第2节 (上午)
      { id: 3, versionId: 1, taskId: 2, classId: 301, subjectId: 2, teacherId: 102, classroomId: 201, slotId: 2, weekMode: 'all', isLocked: false, consecutiveGroup: null, remark: null }
    ]

    const report = buildHealthReportModel({
      versionId: 1,
      versionName: '自动排课 #1 · 均衡档',
      solveMs: 1200,
      hardViolations: 0,
      lessons: mockLessons,
      fixedLessons: [],
      slots: mockSlots,
      subjects: mockSubjects,
      teachers: mockTeachers,
      classrooms: mockClassrooms,
      classes: mockClasses,
      grades: mockGrades
    })

    expect(report.versionId).toBe(1)
    expect(report.overallScore).toBeGreaterThanOrEqual(80)
    expect(report.hardViolations).toBe(0)
    expect(report.totalLessons).toBe(3)
    expect(report.activeTeachers).toBe(2)
    expect(report.teacherGapCount).toBe(1) // 张三 周一 第1节与第3节之间空了第2节
    expect(report.maxTeacherDayPeriods).toBe(2)

    // Check dimensions
    expect(report.dimensions).toHaveLength(6)
    const dimKeys = report.dimensions.map((d) => d.key)
    expect(dimKeys).toContain('teacher_load')
    expect(dimKeys).toContain('teacher_gap')
    expect(dimKeys).toContain('morning_rate')
    expect(dimKeys).toContain('compliance')
    expect(dimKeys).toContain('resource_util')
    expect(dimKeys).toContain('subject_dispersion')

    // Check teacher stats
    const zhang = report.teacherStats.find((t) => t.teacherId === 101)
    expect(zhang?.totalPeriods).toBe(2)
    expect(zhang?.gapCount).toBe(1)

    // Check heatmap
    expect(report.heatmap).toHaveLength(4)
    expect(report.heatmap[0].lessonCount).toBe(1)

    // Check histogram
    expect(report.teacherLoadHistogram).toHaveLength(4)

    // Check issues: should detect unused special room and afternoon main subject
    expect(report.issues.length).toBeGreaterThan(0)
    const roomIssue = report.issues.find((i) => i.targetView === 'room' && i.targetId === 202)
    expect(roomIssue).toBeDefined()
    expect(roomIssue?.title).toContain('美术专用教室')

    // Check baseline comparison
    expect(report.comparison.length).toBeGreaterThanOrEqual(4)
    expect(report.comparison[0].metric).toBe('教师日课时方差')
  })

  it('handles hard violations and adjusts compliance score', () => {
    const report = buildHealthReportModel({
      versionId: 2,
      versionName: '测试版本',
      solveMs: 800,
      hardViolations: 2,
      lessons: [],
      fixedLessons: [],
      slots: mockSlots,
      subjects: mockSubjects,
      teachers: mockTeachers,
      classrooms: mockClassrooms,
      classes: mockClasses,
      grades: mockGrades
    })

    expect(report.hardViolations).toBe(2)
    const compDim = report.dimensions.find((d) => d.key === 'compliance')
    expect(compDim?.score).toBe(50) // 100 - 2 * 25
    expect(compDim?.status).toBe('bad')

    const hardIssue = report.issues.find((i) => i.title.includes('硬约束冲突'))
    expect(hardIssue).toBeDefined()
  })

  it('generates teacher workload and gap issues with exact navigation target info', () => {
    // 构造李四在周一上 6 节课
    const fullSlots: TimeSlot[] = [
      { id: 1, stageId: 2, dayOfWeek: 1, periodIndex: 1, periodName: '第1节', startTime: '08:00', endTime: '08:45', segment: 'morning', isTeaching: true, sortOrder: 1 },
      { id: 2, stageId: 2, dayOfWeek: 1, periodIndex: 2, periodName: '第2节', startTime: '08:55', endTime: '09:40', segment: 'morning', isTeaching: true, sortOrder: 2 },
      { id: 3, stageId: 2, dayOfWeek: 1, periodIndex: 3, periodName: '第3节', startTime: '10:00', endTime: '10:45', segment: 'morning', isTeaching: true, sortOrder: 3 },
      { id: 4, stageId: 2, dayOfWeek: 1, periodIndex: 4, periodName: '第4节', startTime: '10:55', endTime: '11:40', segment: 'morning', isTeaching: true, sortOrder: 4 },
      { id: 5, stageId: 2, dayOfWeek: 1, periodIndex: 5, periodName: '第5节', startTime: '14:00', endTime: '14:45', segment: 'afternoon', isTeaching: true, sortOrder: 5 },
      { id: 6, stageId: 2, dayOfWeek: 1, periodIndex: 6, periodName: '第6节', startTime: '14:55', endTime: '15:40', segment: 'afternoon', isTeaching: true, sortOrder: 6 }
    ]
    const lessons: Lesson[] = fullSlots.map((s, idx) => ({
      id: idx + 1,
      versionId: 10,
      taskId: 1,
      classId: 301,
      subjectId: 2,
      teacherId: 102,
      classroomId: 201,
      slotId: s.id,
      weekMode: 'all',
      isLocked: false,
      consecutiveGroup: null,
      remark: null
    }))

    const report = buildHealthReportModel({
      versionId: 10,
      versionName: '测试版本 #10',
      solveMs: 600,
      hardViolations: 0,
      lessons,
      fixedLessons: [],
      slots: fullSlots,
      subjects: mockSubjects,
      teachers: mockTeachers,
      classrooms: mockClassrooms,
      classes: mockClasses,
      grades: mockGrades
    })

    const teacherLoadIssue = report.issues.find((i) => i.category === 'teacher_load' && i.targetId === 102)
    expect(teacherLoadIssue).toBeDefined()
    expect(teacherLoadIssue?.targetView).toBe('teacher')
    expect(teacherLoadIssue?.targetId).toBe(102)
    expect(teacherLoadIssue?.targetName).toBe('李四')
    expect(teacherLoadIssue?.title).toContain('李四')
  })
})
