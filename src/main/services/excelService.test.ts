import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import {
  writeSingleTimetableWorksheet,
  writeOverviewWorksheet,
  validateAndConvertImageBuffer
} from './excelService'
import {
  buildOverviewExportSheet,
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
  { id: 1, name: '语文', shortName: '语', color: '#ef4444', category: 'main', importance: 1, needSpecialRoom: false, stageId: 2, dailyMax: 2, weekSpread: 'spread', sortOrder: 1 },
  { id: 2, name: '数学', shortName: '数', color: '#3b82f6', category: 'main', importance: 1, needSpecialRoom: false, stageId: 2, dailyMax: 2, weekSpread: 'spread', sortOrder: 2 }
]

const mockTeachers: Teacher[] = [
  { id: 101, name: '张三', staffNo: 'T001', phone: null, maxWeeklyPeriods: 16, building: null, enabled: true, subjectIds: [1] }
]

const mockClassrooms: Classroom[] = [
  { id: 201, name: '101教室', roomType: 'normal', capacity: 50, concurrentCapacity: 1, building: '教学楼', enabled: true }
]

const mockGrades: Grade[] = [
  { id: 10, semesterId: 1, stageId: 2, name: '初一', enrollYear: 2026, sortOrder: 1 }
]

const mockClasses: Klass[] = [
  { id: 301, gradeId: 10, name: '初一(1)班', shortName: '初一1', studentCount: 45, isVirtual: false, homeRoomId: 201, headTeacherId: 101, sortOrder: 1 }
]

const mockSlots: TimeSlot[] = [
  { id: 1, stageId: 2, dayOfWeek: 1, periodIndex: 1, periodName: '第1节', startTime: '08:00', endTime: '08:45', segment: 'morning', isTeaching: true, sortOrder: 1 },
  { id: 2, stageId: 2, dayOfWeek: 1, periodIndex: 2, periodName: '第2节', startTime: '14:00', endTime: '14:45', segment: 'afternoon', isTeaching: true, sortOrder: 2 }
]

const mockMeta: ExportMetaContext = {
  schoolName: '示范中学',
  semesterName: '2026秋季学期',
  versionName: '自动排课 #1',
  stageName: '初中部',
  subjects: mockSubjects,
  teachers: mockTeachers,
  classrooms: mockClassrooms,
  classes: mockClasses,
  grades: mockGrades
}

describe('excelService · Timetable Excel Worksheet Rendering', () => {
  it('writes single timetable worksheet correctly with title, headers, dividers, and data', async () => {
    const mockLessons: Lesson[] = [
      { id: 1, versionId: 1, taskId: 1, classId: 301, subjectId: 1, teacherId: 101, classroomId: 201, slotId: 1, weekMode: 'all', isLocked: false, consecutiveGroup: null, remark: null }
    ]
    const mockFixed: FixedLesson[] = []

    const sheetData = buildSingleTimetableExportSheet({
      view: 'class',
      targetId: 301,
      slots: mockSlots,
      lessons: mockLessons,
      fixedLessons: mockFixed,
      meta: mockMeta
    })

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(sheetData.sheetName)
    writeSingleTimetableWorksheet(ws, sheetData)

    expect(ws.rowCount).toBeGreaterThanOrEqual(4)
    // Check title in row 1
    expect(ws.getCell(1, 1).value).toContain('初一(1)班 课程表')
    // Check headers in row 3
    expect(ws.getCell(3, 1).value).toBe('节次')
    expect(ws.getCell(3, 2).value).toBe('时间')
    expect(ws.getCell(3, 3).value).toBe('星期一')

    // Generate buffer to test serialization
    const buffer = await wb.xlsx.writeBuffer()
    expect(buffer.byteLength).toBeGreaterThan(0)
  })

  it('writes overview worksheet correctly with grade/class headers and matrix rows', async () => {
    const mockLessons: Lesson[] = [
      { id: 1, versionId: 1, taskId: 1, classId: 301, subjectId: 1, teacherId: 101, classroomId: 201, slotId: 1, weekMode: 'all', isLocked: false, consecutiveGroup: null, remark: null }
    ]

    const overviewData = buildOverviewExportSheet({
      slots: mockSlots,
      stageClasses: mockClasses,
      grades: mockGrades,
      lessons: mockLessons,
      fixedLessons: [],
      meta: mockMeta
    })

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(overviewData.sheetName)
    writeOverviewWorksheet(ws, overviewData)

    expect(ws.rowCount).toBeGreaterThanOrEqual(5)
    expect(ws.getCell(1, 1).value).toContain('全校总课表')
    expect(ws.getCell(4, 3).value).toBe('初一(1)班')

    const buffer = await wb.xlsx.writeBuffer()
    expect(buffer.byteLength).toBeGreaterThan(0)
  })

  it('validates image buffers properly and rejects corrupted 3-byte / empty dataUrl', () => {
    // 1. Rejects "data:," which formerly produced a 3-byte corrupt file
    const invalidBase64 = validateAndConvertImageBuffer({ base64Data: 'data:,' })
    expect(invalidBase64.buffer).toBeNull()
    expect(invalidBase64.error).toContain('图像数据为空')

    // 2. Rejects random invalid bytes without PNG/JPEG magic headers
    const badBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const badResult = validateAndConvertImageBuffer({ buffer: badBytes })
    expect(badResult.buffer).toBeNull()
    expect(badResult.error).toContain('字节数不足')

    // 3. Accepts valid PNG header
    const validPngBytes = new Uint8Array(128)
    validPngBytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    const validPngResult = validateAndConvertImageBuffer({ buffer: validPngBytes })
    expect(validPngResult.buffer).not.toBeNull()
    expect(validPngResult.buffer?.length).toBe(128)

    // 4. Accepts valid JPEG header
    const validJpgBytes = new Uint8Array(100)
    validJpgBytes.set([0xff, 0xd8, 0xff, 0xe0], 0)
    const validJpgResult = validateAndConvertImageBuffer({ buffer: validJpgBytes })
    expect(validJpgResult.buffer).not.toBeNull()
    expect(validJpgResult.buffer?.length).toBe(100)
  })
})
