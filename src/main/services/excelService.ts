import { dialog, BrowserWindow } from 'electron'
import ExcelJS from 'exceljs'
import { getDb } from '../db/connection'
import { schoolRepo } from '../db/repositories/schoolRepo'
import { semesterRepo } from '../db/repositories/semesterRepo'
import { stageRepo } from '../db/repositories/stageRepo'
import { gradeRepo } from '../db/repositories/gradeRepo'
import { classRepo } from '../db/repositories/classRepo'
import { subjectRepo } from '../db/repositories/subjectRepo'
import { teacherRepo } from '../db/repositories/teacherRepo'
import { classroomRepo } from '../db/repositories/classroomRepo'
import { fixedLessonRepo } from '../db/repositories/fixedLessonRepo'
import { getVersionLessons } from './scheduleResultService'
import { ROOM_TYPES } from '@shared/domain'
import type { RoomType } from '@shared/domain'
import type { ExcelExportResult, ExcelImportResult, TimeSlot } from '@shared/types/entities'
import type { TimetableExportParams } from '@shared/types/ipc'
import {
  buildOverviewExportSheet,
  buildSingleTimetableExportSheet,
  sanitizeSheetName,
  type ExportMetaContext,
  type OverviewExportSheet,
  type SingleTimetableExportSheet
} from '@shared/timetableExport'

type Cell = string | number | null

function focused(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

function cellStr(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    // 富文本 / 公式 / 超链接等
    const anyv = v as { text?: string; result?: unknown; richText?: { text: string }[] }
    if (Array.isArray(anyv.richText)) return anyv.richText.map((t) => t.text).join('')
    if (anyv.text != null) return String(anyv.text)
    if (anyv.result != null) return String(anyv.result)
    return ''
  }
  return String(v)
}

function isYes(v: ExcelJS.CellValue): boolean {
  const s = cellStr(v).trim()
  return s === '是' || s.toLowerCase() === 'true' || s === '1' || s === 'Y' || s === 'y'
}

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
}

/** 写入单张实体课表（班级 / 教师 / 教室）工作表 */
export function writeSingleTimetableWorksheet(
  ws: ExcelJS.Worksheet,
  data: SingleTimetableExportSheet
): void {
  const totalCols = 2 + data.days.length

  // 1. 标题行
  ws.mergeCells(1, 1, 1, totalCols)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = data.title
  titleCell.font = { name: 'Microsoft YaHei', size: 14, bold: true, color: { argb: 'FF1E1B4B' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(1).height = 32

  // 2. 副标题行
  ws.mergeCells(2, 1, 2, totalCols)
  const subCell = ws.getCell(2, 1)
  subCell.value = data.subTitle
  subCell.font = { name: 'Microsoft YaHei', size: 9.5, color: { argb: 'FF475569' } }
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
  subCell.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(2).height = 20

  // 3. 表头行 (Row 3)
  const h1 = ws.getCell(3, 1)
  h1.value = '节次'
  const h2 = ws.getCell(3, 2)
  h2.value = '时间'
  ;[h1, h2].forEach((c) => {
    c.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FF1E293B' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
    c.alignment = { vertical: 'middle', horizontal: 'center' }
    c.border = BORDER_THIN
  })

  data.days.forEach((d, i) => {
    const c = ws.getCell(3, 3 + i)
    c.value = data.dayNames[d] ?? `星期${d}`
    c.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FF1E293B' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
    c.alignment = { vertical: 'middle', horizontal: 'center' }
    c.border = BORDER_THIN
  })
  ws.getRow(3).height = 24

  // 4. 数据行 (Row 4..)
  let currentRow = 4
  for (const row of data.rows) {
    if (row.dividerBefore) {
      ws.mergeCells(currentRow, 1, currentRow, totalCols)
      const divCell = ws.getCell(currentRow, 1)
      divCell.value = row.dividerBefore
      divCell.font = { name: 'Microsoft YaHei', size: 9.5, italic: true, color: { argb: 'FF64748B' } }
      divCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      divCell.alignment = { vertical: 'middle', horizontal: 'center' }
      for (let c = 1; c <= totalCols; c++) {
        ws.getCell(currentRow, c).border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        }
      }
      ws.getRow(currentRow).height = 22
      currentRow++
    }

    const pNameCell = ws.getCell(currentRow, 1)
    pNameCell.value = row.periodName
    pNameCell.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FF334155' } }
    pNameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    pNameCell.alignment = { vertical: 'middle', horizontal: 'center' }
    pNameCell.border = BORDER_THIN

    const pTimeCell = ws.getCell(currentRow, 2)
    pTimeCell.value = row.timeRange
    pTimeCell.font = { name: 'Microsoft YaHei', size: 8.5, color: { argb: 'FF64748B' } }
    pTimeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    pTimeCell.alignment = { vertical: 'middle', horizontal: 'center' }
    pTimeCell.border = BORDER_THIN

    data.days.forEach((d, i) => {
      const colIdx = 3 + i
      const gridCell = row.cellsByDay.get(d)
      const c = ws.getCell(currentRow, colIdx)
      const val = gridCell?.formattedText ?? ''
      c.value = val
      c.font = { name: 'Microsoft YaHei', size: 9.5, color: { argb: 'FF0F172A' } }
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      c.border = BORDER_THIN

      if (gridCell && gridCell.items.some((it) => it.isLocked)) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }
      } else if (val) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      } else {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } }
      }
    })

    ws.getRow(currentRow).height = 42
    currentRow++
  }

  // 5. 统计汇总行
  ws.mergeCells(currentRow, 1, currentRow, totalCols)
  const sumCell = ws.getCell(currentRow, 1)
  sumCell.value = `统计：周课时共 ${data.stats.totalLessons} 节 (预排锁定 ${data.stats.lockedLessons} 节，固定占位 ${data.stats.overlayItems} 节，连堂 ${data.stats.consecutiveCount} 节)`
  sumCell.font = { name: 'Microsoft YaHei', size: 9, italic: true, color: { argb: 'FF64748B' } }
  sumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
  sumCell.alignment = { vertical: 'middle', horizontal: 'right' }
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(currentRow, c).border = BORDER_THIN
  }
  ws.getRow(currentRow).height = 22

  // 6. 列宽与视图冻结
  ws.getColumn(1).width = 10
  ws.getColumn(2).width = 16
  for (let i = 0; i < data.days.length; i++) {
    ws.getColumn(3 + i).width = 22
  }

  ws.views = [{ state: 'frozen', ySplit: 3 }]
}

/** 写入全校 / 学段总表工作表 */
export function writeOverviewWorksheet(ws: ExcelJS.Worksheet, data: OverviewExportSheet): void {
  const totalCols = Math.max(2, 2 + data.classes.length)

  // 1. 标题行
  ws.mergeCells(1, 1, 1, totalCols)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = data.title
  titleCell.font = { name: 'Microsoft YaHei', size: 14, bold: true, color: { argb: 'FF1E1B4B' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(1).height = 32

  // 2. 副标题行
  ws.mergeCells(2, 1, 2, totalCols)
  const subCell = ws.getCell(2, 1)
  subCell.value = data.subTitle
  subCell.font = { name: 'Microsoft YaHei', size: 9.5, color: { argb: 'FF475569' } }
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
  subCell.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(2).height = 20

  // 3. 表头第一行（年级分组）
  ws.mergeCells(3, 1, 4, 1)
  const h1 = ws.getCell(3, 1)
  h1.value = '星期'
  h1.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FF1E293B' } }
  h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  h1.alignment = { vertical: 'middle', horizontal: 'center' }
  h1.border = BORDER_THIN
  ws.getCell(4, 1).border = BORDER_THIN

  ws.mergeCells(3, 2, 4, 2)
  const h2 = ws.getCell(3, 2)
  h2.value = '节次'
  h2.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FF1E293B' } }
  h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  h2.alignment = { vertical: 'middle', horizontal: 'center' }
  h2.border = BORDER_THIN
  ws.getCell(4, 2).border = BORDER_THIN

  let colPointer = 3
  for (const grade of data.grades) {
    const endCol = colPointer + grade.classCount - 1
    if (endCol >= colPointer) {
      ws.mergeCells(3, colPointer, 3, endCol)
      const gc = ws.getCell(3, colPointer)
      gc.value = `${grade.name} (${grade.classCount}班)`
      gc.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FF312E81' } }
      gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } }
      gc.alignment = { vertical: 'middle', horizontal: 'center' }
      for (let c = colPointer; c <= endCol; c++) {
        ws.getCell(3, c).border = BORDER_THIN
      }
      colPointer = endCol + 1
    }
  }

  // 4. 表头第二行（班级列名）
  data.classes.forEach((cls, i) => {
    const cc = ws.getCell(4, 3 + i)
    cc.value = cls.name
    cc.font = { name: 'Microsoft YaHei', size: 9.5, bold: true, color: { argb: 'FF1E293B' } }
    cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    cc.alignment = { vertical: 'middle', horizontal: 'center' }
    cc.border = BORDER_THIN
  })
  ws.getRow(3).height = 22
  ws.getRow(4).height = 22

  // 5. 数据行
  let currentRow = 5
  for (const row of data.rows) {
    if (row.dividerBefore) {
      ws.mergeCells(currentRow, 1, currentRow, totalCols)
      const divCell = ws.getCell(currentRow, 1)
      divCell.value = row.dividerBefore
      divCell.font = { name: 'Microsoft YaHei', size: 9.5, italic: true, color: { argb: 'FF64748B' } }
      divCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      divCell.alignment = { vertical: 'middle', horizontal: 'center' }
      for (let c = 1; c <= totalCols; c++) {
        ws.getCell(currentRow, c).border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        }
      }
      ws.getRow(currentRow).height = 20
      currentRow++
    }

    const dCell = ws.getCell(currentRow, 1)
    dCell.value = row.dayName
    dCell.font = { name: 'Microsoft YaHei', size: 9.5, bold: true, color: { argb: 'FF334155' } }
    dCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    dCell.alignment = { vertical: 'middle', horizontal: 'center' }
    dCell.border = BORDER_THIN

    const pCell = ws.getCell(currentRow, 2)
    pCell.value = `${row.periodName} ${row.timeRange}`.trim()
    pCell.font = { name: 'Microsoft YaHei', size: 9, color: { argb: 'FF64748B' } }
    pCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    pCell.alignment = { vertical: 'middle', horizontal: 'center' }
    pCell.border = BORDER_THIN

    data.classes.forEach((cls, i) => {
      const cellData = row.cellsByClassId.get(cls.id)
      const c = ws.getCell(currentRow, 3 + i)
      const val = cellData?.text ?? ''
      c.value = val
      c.font = { name: 'Microsoft YaHei', size: 9, color: { argb: 'FF0F172A' } }
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      c.border = BORDER_THIN

      if (cellData?.isLocked) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }
      } else if (val) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      } else {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } }
      }
    })

    ws.getRow(currentRow).height = 28
    currentRow++
  }

  // 6. 统计汇总行
  ws.mergeCells(currentRow, 1, currentRow, totalCols)
  const sumCell = ws.getCell(currentRow, 1)
  sumCell.value = `统计：总班级数 ${data.stats.classCount} 班  |  总课节数 ${data.stats.lessonCount} 节  |  授课教师 ${data.stats.teacherCount} 人  |  空闲课位 ${data.stats.emptyCount} 处`
  sumCell.font = { name: 'Microsoft YaHei', size: 9, italic: true, color: { argb: 'FF64748B' } }
  sumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
  sumCell.alignment = { vertical: 'middle', horizontal: 'right' }
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(currentRow, c).border = BORDER_THIN
  }
  ws.getRow(currentRow).height = 22

  ws.getColumn(1).width = 10
  ws.getColumn(2).width = 18
  for (let i = 0; i < data.classes.length; i++) {
    ws.getColumn(3 + i).width = 14
  }

  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }]
}

/** 课表 Excel 导出主服务 */
export async function exportTimetable(params: TimetableExportParams): Promise<ExcelExportResult> {
  const db = getDb()
  const school = schoolRepo.get()
  const schoolName = school?.name ?? '学校'
  const semester = semesterRepo.list().find((s) => s.id === params.semesterId)
  const stages = stageRepo.list()
  const grades = gradeRepo.list(params.semesterId)
  const classes = classRepo.listBySemester(params.semesterId)
  const subjects = subjectRepo.list()
  const teachers = teacherRepo.list()
  const classrooms = classroomRepo.list()
  const fixedLessons = fixedLessonRepo.listBySemester(params.semesterId)
  const lessons = getVersionLessons(params.versionId)

  const versionRow = db
    .prepare('SELECT name, weight_profile FROM schedule_version WHERE id = ?')
    .get(params.versionId) as { name: string; weight_profile: string } | undefined
  const versionName = versionRow?.name ?? `排课版本#${params.versionId}`

  const slotsByStage = new Map<number, TimeSlot[]>()
  for (const st of stages) {
    slotsByStage.set(st.id, stageRepo.listSlots(st.id))
  }

  const gradeById = new Map(grades.map((g) => [g.id, g]))
  const stageOfClass = new Map<number, number>()
  for (const c of classes) {
    const sid = gradeById.get(c.gradeId)?.stageId
    if (sid != null) stageOfClass.set(c.id, sid)
  }

  const defaultStage = stages.find((st) => st.enabled) ?? stages[0]
  const currentStageId = params.stageId ?? defaultStage?.id ?? 1
  const currentStage = stages.find((st) => st.id === currentStageId)

  const metaContext: ExportMetaContext = {
    schoolName,
    semesterName: semester?.name,
    versionName,
    stageName: currentStage?.name,
    subjects,
    teachers,
    classrooms,
    classes,
    grades
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = '智课排 CourseSchedulingSystem'
  wb.lastModifiedBy = '智课排'
  wb.created = new Date()
  wb.modified = new Date()

  let defaultFileName = `${schoolName}_${semester?.name ?? ''}_课表.xlsx`
  let totalSheets = 0
  const scope = params.scope ?? 'current'

  if (scope === 'all_classes') {
    const targetClasses = classes.filter((c) => stageOfClass.get(c.id) === currentStageId)
    const exportClassesList = targetClasses.length > 0 ? targetClasses : classes
    for (const cls of exportClassesList) {
      const sid = stageOfClass.get(cls.id) ?? currentStageId
      const slots = slotsByStage.get(sid) ?? []
      const sheetData = buildSingleTimetableExportSheet({
        view: 'class',
        targetId: cls.id,
        slots,
        lessons,
        fixedLessons,
        meta: { ...metaContext, stageName: stages.find((s) => s.id === sid)?.name }
      })
      const ws = wb.addWorksheet(sheetData.sheetName)
      writeSingleTimetableWorksheet(ws, sheetData)
      totalSheets++
    }
    defaultFileName = `${schoolName}_${semester?.name ?? ''}_${currentStage?.name ?? '全校'}_班级课表汇总.xlsx`
  } else if (scope === 'all_teachers') {
    const targetTeachers = teachers.filter((t) => t.enabled)
    const slots = slotsByStage.get(currentStageId) ?? []
    for (const tch of targetTeachers) {
      const sheetData = buildSingleTimetableExportSheet({
        view: 'teacher',
        targetId: tch.id,
        slots,
        lessons,
        fixedLessons,
        meta: metaContext
      })
      const name = sanitizeSheetName(tch.staffNo ? `${tch.staffNo}_${tch.name}` : tch.name, `T_${tch.id}`)
      const ws = wb.addWorksheet(name)
      writeSingleTimetableWorksheet(ws, sheetData)
      totalSheets++
    }
    defaultFileName = `${schoolName}_${semester?.name ?? ''}_教师课表汇总.xlsx`
  } else if (scope === 'all_rooms') {
    const targetRooms = classrooms.filter((r) => r.enabled)
    const slots = slotsByStage.get(currentStageId) ?? []
    for (const rm of targetRooms) {
      const sheetData = buildSingleTimetableExportSheet({
        view: 'room',
        targetId: rm.id,
        slots,
        lessons,
        fixedLessons,
        meta: metaContext
      })
      const ws = wb.addWorksheet(sheetData.sheetName)
      writeSingleTimetableWorksheet(ws, sheetData)
      totalSheets++
    }
    defaultFileName = `${schoolName}_${semester?.name ?? ''}_教室课表汇总.xlsx`
  } else if (scope === 'overview' || params.view === 'overview') {
    const stageClasses = classes.filter((c) => stageOfClass.get(c.id) === currentStageId)
    const slots = slotsByStage.get(currentStageId) ?? []
    const overviewData = buildOverviewExportSheet({
      slots,
      stageClasses: stageClasses.length > 0 ? stageClasses : classes,
      grades,
      lessons,
      fixedLessons,
      meta: metaContext
    })
    const ws = wb.addWorksheet(overviewData.sheetName)
    writeOverviewWorksheet(ws, overviewData)
    totalSheets = 1
    defaultFileName = `${schoolName}_${semester?.name ?? ''}_${currentStage?.name ?? '全校'}_总课表.xlsx`
  } else {
    // scope === 'current'
    if (params.view === 'class') {
      const targetId = params.targetId ?? classes[0]?.id
      if (targetId == null) throw new Error('未选择导出班级')
      const targetClass = classes.find((c) => c.id === targetId)
      const sid = stageOfClass.get(targetId) ?? currentStageId
      const slots = slotsByStage.get(sid) ?? []
      const sheetData = buildSingleTimetableExportSheet({
        view: 'class',
        targetId,
        slots,
        lessons,
        fixedLessons,
        meta: { ...metaContext, stageName: stages.find((s) => s.id === sid)?.name }
      })
      const ws = wb.addWorksheet(sheetData.sheetName)
      writeSingleTimetableWorksheet(ws, sheetData)
      totalSheets = 1
      defaultFileName = `${schoolName}_${semester?.name ?? ''}_${targetClass?.name ?? '班级'}_课表.xlsx`
    } else if (params.view === 'teacher') {
      const targetId = params.targetId ?? teachers.find((t) => t.enabled)?.id
      if (targetId == null) throw new Error('未选择导出教师')
      const targetTeacher = teachers.find((t) => t.id === targetId)
      const slots = slotsByStage.get(currentStageId) ?? []
      const sheetData = buildSingleTimetableExportSheet({
        view: 'teacher',
        targetId,
        slots,
        lessons,
        fixedLessons,
        meta: metaContext
      })
      const ws = wb.addWorksheet(sheetData.sheetName)
      writeSingleTimetableWorksheet(ws, sheetData)
      totalSheets = 1
      defaultFileName = `${schoolName}_${semester?.name ?? ''}_${targetTeacher?.name ?? '教师'}_课表.xlsx`
    } else {
      // room
      const targetId = params.targetId ?? classrooms.find((r) => r.enabled)?.id
      if (targetId == null) throw new Error('未选择导出教室')
      const targetRoom = classrooms.find((r) => r.id === targetId)
      const slots = slotsByStage.get(currentStageId) ?? []
      const sheetData = buildSingleTimetableExportSheet({
        view: 'room',
        targetId,
        slots,
        lessons,
        fixedLessons,
        meta: metaContext
      })
      const ws = wb.addWorksheet(sheetData.sheetName)
      writeSingleTimetableWorksheet(ws, sheetData)
      totalSheets = 1
      defaultFileName = `${schoolName}_${semester?.name ?? ''}_${targetRoom?.name ?? '教室'}_课表.xlsx`
    }
  }

  const win = focused()
  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    title: '导出课表 Excel',
    defaultPath: defaultFileName.replace(/[\\/:*?"<>|]/g, '_'),
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
  })

  if (canceled || !filePath) return { canceled: true, filePath: null, count: 0 }

  await wb.xlsx.writeFile(filePath)
  return { canceled: false, filePath, count: totalSheets }
}

/** 通用导出：弹保存框 → 写单表 → 返回结果 */
async function exportSheet(
  defaultName: string,
  sheetName: string,
  headers: string[],
  rows: Cell[][]
): Promise<ExcelExportResult> {
  const win = focused()
  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    title: '导出 Excel',
    defaultPath: defaultName,
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
  })
  if (canceled || !filePath) return { canceled: true, filePath: null, count: 0 }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  const headerRow = ws.addRow(headers)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEEF2FF' }
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  for (const r of rows) ws.addRow(r)
  ws.columns.forEach((col) => {
    let max = 10
    col.eachCell?.({ includeEmpty: true }, (c) => {
      max = Math.max(max, cellStr(c.value).length + 2)
    })
    col.width = Math.min(max, 40)
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  await wb.xlsx.writeFile(filePath)
  return { canceled: false, filePath, count: rows.length }
}

/** 通用导入：弹开框 → 读首表 → 返回按列头映射的行对象数组 */
async function importSheet(): Promise<
  { canceled: true } | { canceled: false; headers: string[]; rows: Record<string, string>[] }
> {
  const win = focused()
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    title: '导入 Excel',
    properties: ['openFile'],
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
  })
  if (canceled || filePaths.length === 0) return { canceled: true }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePaths[0])
  const ws = wb.worksheets[0]
  if (!ws) return { canceled: false, headers: [], rows: [] }

  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => {
    headers[col - 1] = cellStr(c.value).trim()
  })

  const rows: Record<string, string>[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const obj: Record<string, string> = {}
    let hasAny = false
    headers.forEach((h, i) => {
      if (!h) return
      const val = cellStr(row.getCell(i + 1).value).trim()
      obj[h] = val
      if (val) hasAny = true
    })
    if (hasAny) rows.push(obj)
  }
  return { canceled: false, headers, rows }
}

// ============ 教师 ============
const TEACHER_HEADERS = ['姓名', '工号', '电话', '周最大课时', '办公楼栋', '启用', '任教学科']

export async function exportTeachers(): Promise<ExcelExportResult> {
  const subjById = new Map(subjectRepo.list().map((s) => [s.id, s.name]))
  const rows: Cell[][] = teacherRepo.list().map((t) => [
    t.name,
    t.staffNo ?? '',
    t.phone ?? '',
    t.maxWeeklyPeriods,
    t.building ?? '',
    t.enabled ? '是' : '否',
    t.subjectIds.map((id) => subjById.get(id) ?? '').filter(Boolean).join('、')
  ])
  return exportSheet('教师名单.xlsx', '教师', TEACHER_HEADERS, rows)
}

export async function importTeachers(): Promise<ExcelImportResult> {
  const res = await importSheet()
  if (res.canceled) return { canceled: true, imported: 0, skipped: 0, errors: [] }
  const subjByName = new Map(subjectRepo.list().map((s) => [s.name, s.id]))
  const errors: string[] = []
  let imported = 0
  let skipped = 0

  res.rows.forEach((row, idx) => {
    const line = idx + 2
    const name = row['姓名']
    if (!name) {
      skipped++
      errors.push(`第 ${line} 行：缺少教师姓名，已跳过`)
      return
    }
    const rawSubjects = (row['任教学科'] ?? '')
      .split(/[、,，;；\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const subjectIds = rawSubjects
      .map((s) => subjByName.get(s))
      .filter((id): id is number => id != null)
    if (rawSubjects.length > 0 && subjectIds.length === 0) {
      errors.push(`第 ${line} 行：任教学科「${row['任教学科']}」在系统学科库中均未找到`)
    }
    teacherRepo.upsert({
      name,
      staffNo: row['工号'] || null,
      phone: row['电话'] || null,
      maxWeeklyPeriods: row['周最大课时'] ? Number(row['周最大课时']) || 16 : 16,
      building: row['办公楼栋'] || null,
      enabled: row['启用'] ? row['启用'] === '是' : true,
      subjectIds
    })
    imported++
  })
  return { canceled: false, imported, skipped, errors }
}

// ============ 班级 ============
const CLASS_HEADERS = ['年级', '班级名称', '简称', '学生数', '走班']

export async function exportClasses(semesterId: number): Promise<ExcelExportResult> {
  const grades = new Map(gradeRepo.list(semesterId).map((g) => [g.id, g.name]))
  const rows: Cell[][] = classRepo
    .listBySemester(semesterId)
    .map((k) => [
      grades.get(k.gradeId) ?? '',
      k.name,
      k.shortName ?? '',
      k.studentCount,
      k.isVirtual ? '是' : '否'
    ])
  return exportSheet('班级名单.xlsx', '班级', CLASS_HEADERS, rows)
}

export async function importClasses(semesterId: number): Promise<ExcelImportResult> {
  const res = await importSheet()
  if (res.canceled) return { canceled: true, imported: 0, skipped: 0, errors: [] }
  const gradeByName = new Map(gradeRepo.list(semesterId).map((g) => [g.name, g.id]))
  const errors: string[] = []
  let imported = 0
  let skipped = 0

  res.rows.forEach((row, idx) => {
    const line = idx + 2
    const gradeName = row['年级']
    const name = row['班级名称']
    const gradeId = gradeName ? gradeByName.get(gradeName) : undefined
    if (!name || gradeId == null) {
      skipped++
      errors.push(`第 ${line} 行：缺少班级名称或年级「${gradeName ?? ''}」不存在，已跳过`)
      return
    }
    classRepo.upsert({
      gradeId,
      name,
      shortName: row['简称'] || null,
      studentCount: row['学生数'] ? Number(row['学生数']) || 45 : 45,
      isVirtual: isYes(row['走班'] ?? '')
    })
    imported++
  })
  return { canceled: false, imported, skipped, errors }
}

// ============ 教室 ============
const CLASSROOM_HEADERS = ['名称', '类型', '座位容量', '并发班数', '楼栋', '启用']

export async function exportClassrooms(): Promise<ExcelExportResult> {
  const typeLabel = new Map(ROOM_TYPES.map((t) => [t.value, t.label]))
  const rows: Cell[][] = classroomRepo
    .list()
    .map((c) => [
      c.name,
      typeLabel.get(c.roomType) ?? c.roomType,
      c.capacity,
      c.concurrentCapacity,
      c.building ?? '',
      c.enabled ? '是' : '否'
    ])
  return exportSheet('教室清单.xlsx', '教室', CLASSROOM_HEADERS, rows)
}

export async function importClassrooms(): Promise<ExcelImportResult> {
  const res = await importSheet()
  if (res.canceled) return { canceled: true, imported: 0, skipped: 0, errors: [] }
  const typeByLabel = new Map<string, RoomType>(ROOM_TYPES.map((t) => [t.label, t.value]))
  const errors: string[] = []
  let imported = 0
  let skipped = 0

  res.rows.forEach((row, idx) => {
    const line = idx + 2
    const name = row['名称']
    if (!name) {
      skipped++
      errors.push(`第 ${line} 行：缺少名称，已跳过`)
      return
    }
    const rawType = row['类型'] ?? ''
    const roomType: RoomType = typeByLabel.get(rawType) ?? 'normal'
    if (rawType && !typeByLabel.has(rawType)) {
      errors.push(`第 ${line} 行：未知教室类型「${rawType}」，按普通教室处理`)
    }
    classroomRepo.upsert({
      name,
      roomType,
      capacity: row['座位容量'] ? Number(row['座位容量']) || 50 : 50,
      concurrentCapacity: row['并发班数'] ? Number(row['并发班数']) || 1 : 1,
      building: row['楼栋'] || null,
      enabled: row['启用'] ? row['启用'] === '是' : true
    })
    imported++
  })
  return { canceled: false, imported, skipped, errors }
}
