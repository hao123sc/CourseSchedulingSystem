import { dialog, BrowserWindow } from 'electron'
import ExcelJS from 'exceljs'
import { teacherRepo } from '../db/repositories/teacherRepo'
import { classRepo } from '../db/repositories/classRepo'
import { classroomRepo } from '../db/repositories/classroomRepo'
import { subjectRepo } from '../db/repositories/subjectRepo'
import { gradeRepo } from '../db/repositories/gradeRepo'
import { ROOM_TYPES } from '@shared/domain'
import type { RoomType } from '@shared/domain'
import type { ExcelExportResult, ExcelImportResult } from '@shared/types/entities'

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
    t.subjectIds
      .map((id) => subjById.get(id) ?? '')
      .filter(Boolean)
      .join('、')
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
      errors.push(`第 ${line} 行：缺少姓名，已跳过`)
      return
    }
    const subjectIds: number[] = []
    const raw = row['任教学科'] ?? ''
    for (const nm of raw
      .split(/[、,，/\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)) {
      const sid = subjByName.get(nm)
      if (sid) subjectIds.push(sid)
      else errors.push(`第 ${line} 行：未找到学科「${nm}」，已忽略该学科`)
    }
    teacherRepo.upsert({
      name,
      staffNo: row['工号'] || null,
      phone: row['电话'] || null,
      maxWeeklyPeriods: row['周最大课时'] ? Number(row['周最大课时']) || 18 : 18,
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
