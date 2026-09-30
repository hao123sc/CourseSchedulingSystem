import { describe, expect, it } from 'vitest'
import {
  buildOverviewExportSheet,
  buildSingleTimetableExportSheet,
  formatCellItem,
  sanitizeSheetName,
  type ExportMetaContext
} from './timetableExport'
import type {
  Classroom,
  FixedLesson,
  Grade,
  Klass,
  Lesson,
  Subject,
  Teacher,
  TimeSlot
} from './types/entities'

const mockSubjects: Subject[] = [
  { id: 1, name: '语文', shortName: '语', color: '#ef4444', isPractical: false, defaultRoomType: null, sortOrder: 1 },
  { id: 2, name: '数学', shortName: '数', color: '#3b82f6', isPractical: false, defaultRoomType: null, sortOrder: 2 },
  { id: 3, name: '体育', shortName: '体', color: '#10b981', isPractical: true, defaultRoomType: 'field', sortOrder: 3 }
]

const mockTeachers: Teacher[] = [
  { id: 101, name: '张三', staffNo: 'T001', phone: null, maxWeeklyPeriods: 16, building: null, enabled: true, subjectIds: [1] },
  { id: 102, name: '李四', staffNo: 'T002', phone: null, maxWeeklyPeriods: 16, building: null, enabled: true, subjectIds: [2] },
  { id: 103, name: '王五', staffNo: 'T003', phone: null, maxWeeklyPeriods: 16, building: null, enabled: true, subjectIds: [3] }
]

const mockClassrooms: Classroom[] = [
  { id: 201, name: '101教室', roomType: 'regular', capacity: 50, concurrentCapacity: 1, building: '教学楼', floor: 1, enabled: true },
  { id: 202, name: '田径场', roomType: 'field', capacity: 200, concurrentCapacity: 4, building: '操场', floor: 1, enabled: true }
]

const mockGrades: Grade[] = [
  { id: 10, semesterId: 1, stageId: 2, name: '初一', code: 'G7', sortOrder: 1 }
]

const mockClasses: Klass[] = [
  { id: 301, gradeId: 10, name: '初一(1)班', shortName: '初一1', studentCount: 45, homeRoomId: 201, headTeacherId: 101, sortOrder: 1 },
  { id: 302, gradeId: 10, name: '初一(2)班', shortName: '初一2', studentCount: 45, homeRoomId: null, headTeacherId: 102, sortOrder: 2 }
]

const mockSlots: TimeSlot[] = [
  // 周一: 上午 1, 2; 下午 3; 晚自习 4
  { id: 1, stageId: 2, dayOfWeek: 1, periodIndex: 1, periodName: '第1节', startTime: '08:00', endTime: '08:45', segment: 'morning', isTeaching: true, sortOrder: 1 },
  { id: 2, stageId: 2, dayOfWeek: 1, periodIndex: 2, periodName: '第2节', startTime: '08:55', endTime: '09:40', segment: 'morning', isTeaching: true, sortOrder: 2 },
  { id: 3, stageId: 2, dayOfWeek: 1, periodIndex: 3, periodName: '第3节', startTime: '14:00', endTime: '14:45', segment: 'afternoon', isTeaching: true, sortOrder: 3 },
  { id: 4, stageId: 2, dayOfWeek: 1, periodIndex: 4, periodName: '第4节', startTime: '18:30', endTime: '19:15', segment: 'evening', isTeaching: true, sortOrder: 4 },
  // 周二: 上午 1, 2; 下午 3; 晚自习 4
  { id: 5, stageId: 2, dayOfWeek: 2, periodIndex: 1, periodName: '第1节', startTime: '08:00', endTime: '08:45', segment: 'morning', isTeaching: true, sortOrder: 5 },
  { id: 6, stageId: 2, dayOfWeek: 2, periodIndex: 2, periodName: '第2节', startTime: '08:55', endTime: '09:40', segment: 'morning', isTeaching: true, sortOrder: 6 },
  { id: 7, stageId: 2, dayOfWeek: 2, periodIndex: 3, periodName: '第3节', startTime: '14:00', endTime: '14:45', segment: 'afternoon', isTeaching: true, sortOrder: 7 },
  { id: 8, stageId: 2, dayOfWeek: 2, periodIndex: 4, periodName: '第4节', startTime: '18:30', endTime: '19:15', segment: 'evening', isTeaching: true, sortOrder: 8 }
]

const mockMeta: ExportMetaContext = {
  schoolName: '示范中学',
  semesterName: '2026秋季学期',
  versionName: '自动排课 #1 · 均衡档',
  stageName: '初中部',
  subjects: mockSubjects,
  teachers: mockTeachers,
  classrooms: mockClassrooms,
  classes: mockClasses,
  grades: mockGrades
}

describe('timetableExport · Pure functions and formatting', () => {
  describe('sanitizeSheetName', () => {
    it('cleans invalid Excel characters and enforces 31 char limit', () => {
      expect(sanitizeSheetName('高一[1]班/测试*课表?')).toBe('高一_1_班_测试_课表_')
      expect(sanitizeSheetName('a'.repeat(40))).toHaveLength(31)
      expect(sanitizeSheetName('')).toBe('Sheet')
      expect(sanitizeSheetName('   ')).toBe('Sheet')
    })
  })

  describe('formatCellItem', () => {
    it('formats class view item correctly', () => {
      expect(
        formatCellItem('class', {
          subjectName: '语文',
          teacherName: '张三',
          roomName: '101教室',
          isLocked: false,
          isOverlay: false
        })
      ).toBe('语文\n张三 · 101教室')

      // Pre-scheduled locked lesson
      expect(
        formatCellItem('class', {
          subjectName: '语文',
          teacherName: '张三',
          isLocked: true,
          isOverlay: false
        })
      ).toBe('语文 [预排]\n张三')

      // Non-subject fixed overlay
      expect(
        formatCellItem('class', {
          subjectName: '',
          label: '升旗仪式',
          isLocked: true,
          isOverlay: true
        })
      ).toBe('升旗仪式')
    })

    it('formats teacher view item correctly', () => {
      expect(
        formatCellItem('teacher', {
          subjectName: '数学',
          className: '初一(1)班',
          roomName: '101教室',
          isLocked: false,
          isOverlay: false
        })
      ).toBe('数学\n初一(1)班 · 101教室')

      expect(
        formatCellItem('teacher', {
          subjectName: '',
          label: '备课教研',
          roomName: '教研室',
          isLocked: true,
          isOverlay: true
        })
      ).toBe('备课教研\n教研室')
    })

    it('formats room view item correctly', () => {
      expect(
        formatCellItem('room', {
          subjectName: '体育',
          className: '初一(1)班',
          teacherName: '王五',
          isLocked: false,
          isOverlay: false
        })
      ).toBe('初一(1)班 · 体育 (王五)')

      expect(
        formatCellItem('room', {
          subjectName: '',
          label: '场地维护',
          isLocked: true,
          isOverlay: true
        })
      ).toBe('场地维护 (占用)')
    })
  })

  describe('buildSingleTimetableExportSheet', () => {
    it('builds class timetable with normal lessons, locked lessons, consecutive lessons, and dividers', () => {
      const mockLessons: Lesson[] = [
        // 周一 第1节 语文 (张三)
        { id: 1, versionId: 1, taskId: 1, classId: 301, subjectId: 1, teacherId: 101, classroomId: 201, slotId: 1, weekMode: 'all', isLocked: false, consecutiveGroup: null, remark: null },
        // 周一 第2节 语文 (张三) 连堂
        { id: 2, versionId: 1, taskId: 1, classId: 301, subjectId: 1, teacherId: 101, classroomId: 201, slotId: 2, weekMode: 'all', isLocked: false, consecutiveGroup: 'cg-1', remark: null },
        // 周二 第1节 数学 (李四) [预排锁定]
        { id: 3, versionId: 1, taskId: 2, classId: 301, subjectId: 2, teacherId: 102, classroomId: 201, slotId: 5, weekMode: 'all', isLocked: true, consecutiveGroup: null, remark: null }
      ]

      const mockFixed: FixedLesson[] = [
        // 周一 第4节 晚自习（纯占位，无学科）
        { id: 10, semesterId: 1, stageId: 2, gradeId: 10, classId: 301, teacherId: null, classroomId: null, subjectId: null, slotId: 4, weekMode: 'all', kind: 'lesson', label: '晚自习' },
        // 周二 第1节 已物化的数学（应该被去重，不重复渲染）
        { id: 11, semesterId: 1, stageId: 2, gradeId: 10, classId: 301, teacherId: 102, classroomId: 201, subjectId: 2, slotId: 5, weekMode: 'all', kind: 'lesson', label: null }
      ]

      const sheet = buildSingleTimetableExportSheet({
        view: 'class',
        targetId: 301,
        slots: mockSlots,
        lessons: mockLessons,
        fixedLessons: mockFixed,
        meta: mockMeta
      })

      expect(sheet.targetName).toBe('初一(1)班')
      expect(sheet.title).toContain('初一(1)班 课程表')
      expect(sheet.subTitle).toContain('班主任：张三')
      expect(sheet.days).toEqual([1, 2])
      expect(sheet.rows).toHaveLength(4)

      // 检查段分隔符
      expect(sheet.rows[2].dividerBefore).toContain('午休')
      expect(sheet.rows[3].dividerBefore).toContain('晚间')

      // 周一 第1节: 语文\n张三 · 101教室
      const cellMonP1 = sheet.rows[0].cellsByDay.get(1)
      expect(cellMonP1?.formattedText).toBe('语文\n张三 · 101教室')

      // 周二 第1节: 数学 [预排]\n李四 · 101教室 (物化去重后只有一条)
      const cellTueP1 = sheet.rows[0].cellsByDay.get(2)
      expect(cellTueP1?.items).toHaveLength(1)
      expect(cellTueP1?.formattedText).toBe('数学 [预排]\n李四 · 101教室')

      // 周一 第4节: 晚自习
      const cellMonP4 = sheet.rows[3].cellsByDay.get(1)
      expect(cellMonP4?.formattedText).toBe('晚自习')

      // Stats
      expect(sheet.stats.totalLessons).toBe(3)
      expect(sheet.stats.lockedLessons).toBe(1)
      expect(sheet.stats.overlayItems).toBe(1)
      expect(sheet.stats.consecutiveCount).toBe(1)
    })

    it('builds teacher timetable with correct classes and empty slots', () => {
      const mockLessons: Lesson[] = [
        { id: 1, versionId: 1, taskId: 1, classId: 301, subjectId: 1, teacherId: 101, classroomId: 201, slotId: 1, weekMode: 'all', isLocked: false, consecutiveGroup: null, remark: null },
        { id: 2, versionId: 1, taskId: 3, classId: 302, subjectId: 1, teacherId: 101, classroomId: null, slotId: 7, weekMode: 'all', isLocked: false, consecutiveGroup: null, remark: null }
      ]

      const sheet = buildSingleTimetableExportSheet({
        view: 'teacher',
        targetId: 101,
        slots: mockSlots,
        lessons: mockLessons,
        fixedLessons: [],
        meta: mockMeta
      })

      expect(sheet.targetName).toBe('张三')
      expect(sheet.title).toContain('张三 课程表')

      // 周一 第1节
      const cellMonP1 = sheet.rows[0].cellsByDay.get(1)
      expect(cellMonP1?.formattedText).toBe('语文\n初一(1)班 · 101教室')

      // 周二 第3节
      const cellTueP3 = sheet.rows[2].cellsByDay.get(2)
      expect(cellTueP3?.formattedText).toBe('语文\n初一(2)班')

      // 空白格
      const emptyCell = sheet.rows[1].cellsByDay.get(1)
      expect(emptyCell?.formattedText).toBe('')
    })

    it('builds classroom timetable with multi-concurrent lessons in the same slot', () => {
      const mockLessons: Lesson[] = [
        // 周一 第3节: 初一(1)班 体育 (王五) 在 田径场
        { id: 1, versionId: 1, taskId: 4, classId: 301, subjectId: 3, teacherId: 103, classroomId: 202, slotId: 3, weekMode: 'all', isLocked: false, consecutiveGroup: null, remark: null },
        // 周一 第3节: 初一(2)班 体育 (李四) 也在 田径场（并发课）
        { id: 2, versionId: 1, taskId: 5, classId: 302, subjectId: 3, teacherId: 102, classroomId: 202, slotId: 3, weekMode: 'all', isLocked: false, consecutiveGroup: null, remark: null }
      ]

      const sheet = buildSingleTimetableExportSheet({
        view: 'room',
        targetId: 202,
        slots: mockSlots,
        lessons: mockLessons,
        fixedLessons: [],
        meta: mockMeta
      })

      expect(sheet.targetName).toBe('田径场')
      expect(sheet.title).toContain('田径场 课程表')

      const cellMonP3 = sheet.rows[2].cellsByDay.get(1)
      expect(cellMonP3?.items).toHaveLength(2)
      expect(cellMonP3?.formattedText).toContain('初一(1)班 · 体育 (王五)')
      expect(cellMonP3?.formattedText).toContain('初一(2)班 · 体育 (李四)')
    })
  })

  describe('buildOverviewExportSheet', () => {
    it('builds overview sheet with class columns, day-period rows, and correct statistics', () => {
      const mockLessons: Lesson[] = [
        { id: 1, versionId: 1, taskId: 1, classId: 301, subjectId: 1, teacherId: 101, classroomId: 201, slotId: 1, weekMode: 'all', isLocked: false, consecutiveGroup: null, remark: null },
        { id: 2, versionId: 1, taskId: 2, classId: 302, subjectId: 2, teacherId: 102, classroomId: 201, slotId: 1, weekMode: 'all', isLocked: false, consecutiveGroup: null, remark: null }
      ]

      const mockFixed: FixedLesson[] = [
        { id: 10, semesterId: 1, stageId: 2, gradeId: 10, classId: null, teacherId: null, classroomId: null, subjectId: null, slotId: 4, weekMode: 'all', kind: 'lesson', label: '晚自习' }
      ]

      const overview = buildOverviewExportSheet({
        slots: mockSlots,
        stageClasses: mockClasses,
        grades: mockGrades,
        lessons: mockLessons,
        fixedLessons: mockFixed,
        meta: mockMeta
      })

      expect(overview.classes).toHaveLength(2)
      expect(overview.grades).toHaveLength(1)
      expect(overview.rows).toHaveLength(8) // 2 days * 4 slots

      // Check row 0 (周一 第1节)
      const r0 = overview.rows[0]
      expect(r0.day).toBe(1)
      expect(r0.periodName).toBe('第1节')
      expect(r0.cellsByClassId.get(301)?.text).toBe('语文 (张三)')
      expect(r0.cellsByClassId.get(302)?.text).toBe('数学 (李四)')

      // Check row 3 (周一 晚自习 overlay)
      const r3 = overview.rows[3]
      expect(r3.cellsByClassId.get(301)?.text).toBe('晚自习')
      expect(r3.cellsByClassId.get(302)?.text).toBe('晚自习')

      // Check stats
      expect(overview.stats.classCount).toBe(2)
      expect(overview.stats.lessonCount).toBe(4) // 2 lessons + 2 grade fixed overlays
      expect(overview.stats.teacherCount).toBe(2)
    })
  })
})
