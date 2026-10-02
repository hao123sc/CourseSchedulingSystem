import { dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import * as zlib from 'node:zlib'
import crypto from 'node:crypto'
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
      divCell.font = {
        name: 'Microsoft YaHei',
        size: 9.5,
        italic: true,
        color: { argb: 'FF64748B' }
      }
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

  // 7. A4 纸排版与打印设置（确保单张 A4/A3 纸完美自适应）
  const orientation = data.layoutOptions?.orientation ?? 'landscape'
  const paperSize = (data.layoutOptions?.paperSize === 'A3' ? 8 : 9) as ExcelJS.PaperSize // 9 = A4, 8 = A3
  ws.pageSetup = {
    paperSize,
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    verticalCentered: false,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2
    },
    showGridLines: true
  }
  ws.headerFooter = {
    oddHeader: `&C&10&"Microsoft YaHei" ${data.layoutOptions?.customHeader || ''}`,
    oddFooter: `&L&8&"Microsoft YaHei" ${data.layoutOptions?.customFooter || '智课排智能排课系统 · 正式课表'} &R&8&"Microsoft YaHei" 第 &P 页 / 共 &N 页`
  }
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
      divCell.font = {
        name: 'Microsoft YaHei',
        size: 9.5,
        italic: true,
        color: { argb: 'FF64748B' }
      }
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

  // 7. 总表 A3/大幅面纸张页面设置
  ws.pageSetup = {
    paperSize: 8 as ExcelJS.PaperSize, // A3
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    verticalCentered: false,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.3,
      bottom: 0.3,
      header: 0.15,
      footer: 0.15
    },
    showGridLines: true
  }
  ws.headerFooter = {
    oddHeader: `&C&10&"Microsoft YaHei" ${data.layoutOptions?.customHeader || ''}`,
    oddFooter: `&L&8&"Microsoft YaHei" ${data.layoutOptions?.customFooter || '智课排全校总课表'} &R&8&"Microsoft YaHei" 第 &P 页 / 共 &N 页`
  }
}

/** 校验并提取图像二进制数据（支持 Uint8Array、ArrayBuffer、Buffer 以及安全 Base64 格式） */
export function validateAndConvertImageBuffer(payload: {
  buffer?: Uint8Array | ArrayBuffer | number[]
  base64Data?: string
}): { buffer: Buffer | null; error?: string } {
  let fileBuffer: Buffer | null = null

  if (payload.buffer) {
    if (payload.buffer instanceof Uint8Array || Buffer.isBuffer(payload.buffer)) {
      fileBuffer = Buffer.from(payload.buffer)
    } else if (payload.buffer instanceof ArrayBuffer) {
      fileBuffer = Buffer.from(new Uint8Array(payload.buffer))
    } else if (Array.isArray(payload.buffer)) {
      fileBuffer = Buffer.from(payload.buffer)
    }
  } else if (payload.base64Data) {
    const raw = payload.base64Data.trim()
    if (raw === 'data:,' || raw.length < 50) {
      return {
        buffer: null,
        error: '图像数据为空（Canvas 导出超限或未完成渲染），请调低倍率或选择 JPEG 格式导出'
      }
    }
    const cleanBase64 = raw.replace(/^data:image\/\w+;base64,/, '')
    try {
      fileBuffer = Buffer.from(cleanBase64, 'base64')
    } catch {
      return { buffer: null, error: 'Base64 图像解码失败' }
    }
  }

  if (!fileBuffer || fileBuffer.length < 64) {
    return {
      buffer: null,
      error: '图像数据为空或字节数不足，无法生成有效图片文件'
    }
  }

  // 严格检验图片文件头（PNG / JPEG）
  const isPngHeader =
    fileBuffer.length >= 8 &&
    fileBuffer[0] === 0x89 &&
    fileBuffer[1] === 0x50 &&
    fileBuffer[2] === 0x4e &&
    fileBuffer[3] === 0x47
  const isJpgHeader =
    fileBuffer.length >= 3 &&
    fileBuffer[0] === 0xff &&
    fileBuffer[1] === 0xd8 &&
    fileBuffer[2] === 0xff

  if (!isPngHeader && !isJpgHeader) {
    return {
      buffer: null,
      error: '生成的图片文件头格式校验失败，非有效的 PNG 或 JPEG 图像'
    }
  }

  return { buffer: fileBuffer }
}

/** 直接导出课表 PDF 文件（Electron 原生 PrintToPDF 引擎，高精度像素级渲染） */
export async function exportTimetablePdf(payload: {
  defaultName: string
  landscape?: boolean
  pageSize?: 'A4' | 'A3'
}): Promise<{ canceled: boolean; filePath: string | null; error?: string }> {
  const win = focused()
  if (!win) {
    return { canceled: true, filePath: null, error: '未找到主窗口' }
  }

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出课表 PDF 文档',
    defaultPath: payload.defaultName.replace(/[\\/:*?"<>|]/g, '_'),
    filters: [{ name: 'PDF 文档 (*.pdf)', extensions: ['pdf'] }]
  })

  if (canceled || !filePath) return { canceled: true, filePath: null }

  try {
    const data = await win.webContents.printToPDF({
      landscape: payload.landscape ?? true,
      pageSize: payload.pageSize ?? 'A4',
      printBackground: true,
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    })
    fs.writeFileSync(filePath, data)
    return { canceled: false, filePath }
  } catch (err) {
    return { canceled: false, filePath: null, error: String(err) }
  }
}

/** 保存大幅面海报图片文件（供广告公司大型喷绘张贴） */
export async function savePosterImage(payload: {
  defaultName: string
  base64Data?: string
  buffer?: Uint8Array | number[]
  mimeType?: string
}): Promise<{ canceled: boolean; filePath: string | null; error?: string }> {
  const validation = validateAndConvertImageBuffer(payload)
  if (!validation.buffer) {
    return { canceled: false, filePath: null, error: validation.error || '图像数据无效' }
  }

  const win = focused()
  const isJpeg =
    payload.mimeType?.includes('jpeg') ||
    payload.mimeType?.includes('jpg') ||
    payload.defaultName.toLowerCase().endsWith('.jpg') ||
    payload.defaultName.toLowerCase().endsWith('.jpeg')

  const filters = isJpeg
    ? [
        { name: 'JPEG 高清大图 (*.jpg;*.jpeg)', extensions: ['jpg', 'jpeg'] },
        { name: 'PNG 广告喷绘图片 (*.png)', extensions: ['png'] }
      ]
    : [
        { name: 'PNG 广告喷绘图片 (*.png)', extensions: ['png'] },
        { name: 'JPEG 高清大图 (*.jpg;*.jpeg)', extensions: ['jpg', 'jpeg'] }
      ]

  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    title: '保存大幅面海报图片（广告公司打印）',
    defaultPath: payload.defaultName.replace(/[\\/:*?"<>|]/g, '_'),
    filters
  })

  if (canceled || !filePath) return { canceled: true, filePath: null }

  fs.writeFileSync(filePath, validation.buffer)
  return { canceled: false, filePath }
}

interface PosterStreamingSession {
  exportId: string
  filePath: string
  fullWidth: number
  fullHeight: number
  fileStream: fs.WriteStream
  deflate: zlib.Deflate
  idatChunks: Buffer[]
  finishPromise: Promise<number>
  resolveFinish: (size: number) => void
  rejectFinish: (err: unknown) => void
}

const activePosterSessions = new Map<string, PosterStreamingSession>()

function calcPngCrc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    let c = (crc ^ buf[i]) & 0xff
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeRawPngChunk(fileStream: fs.WriteStream, type: string, data: Buffer): void {
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  const combined = Buffer.concat([typeBuf, data])
  crcBuf.writeUInt32BE(calcPngCrc32(combined), 0)
  fileStream.write(Buffer.concat([lenBuf, combined, crcBuf]))
}

/** 初始化大幅面海报分块流式导出（支持 20000+ px 超大画幅，零显存压力） */
export async function initPosterExport(payload: {
  defaultName: string
  fullWidth: number
  fullHeight: number
}): Promise<{ canceled: boolean; exportId?: string; filePath?: string | null; error?: string }> {
  const win = focused()
  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    title: '保存大幅面海报图片（广告公司打印）',
    defaultPath: payload.defaultName.replace(/[\\/:*?"<>|]/g, '_'),
    filters: [{ name: 'PNG 广告喷绘图片 (*.png)', extensions: ['png'] }]
  })

  if (canceled || !filePath) return { canceled: true, filePath: null }

  const exportId = crypto.randomUUID()
  const fileStream = fs.createWriteStream(filePath)

  // 1. 写入 PNG 文件签名
  fileStream.write(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

  // 2. 写入 IHDR 头部数据块 (13 字节)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(payload.fullWidth, 0)
  ihdr.writeUInt32BE(payload.fullHeight, 4)
  ihdr[8] = 8 // bit depth: 8
  ihdr[9] = 6 // color type: 6 = RGBA
  ihdr[10] = 0 // compression: Deflate
  ihdr[11] = 0 // filter: standard
  ihdr[12] = 0 // interlace: none
  writeRawPngChunk(fileStream, 'IHDR', ihdr)

  // 3. 创建 Deflate 流
  const deflate = zlib.createDeflate({ level: 4 })
  const idatChunks: Buffer[] = []
  deflate.on('data', (chunk) => idatChunks.push(chunk))

  let resolveFinish!: (size: number) => void
  let rejectFinish!: (err: unknown) => void
  const finishPromise = new Promise<number>((resolve, reject) => {
    resolveFinish = resolve
    rejectFinish = reject
  })

  deflate.on('end', () => {
    const fullIdat = Buffer.concat(idatChunks)
    writeRawPngChunk(fileStream, 'IDAT', fullIdat)
    writeRawPngChunk(fileStream, 'IEND', Buffer.alloc(0))
    fileStream.end(() => {
      try {
        const stats = fs.statSync(filePath)
        resolveFinish(stats.size)
      } catch (err) {
        rejectFinish(err)
      }
    })
  })

  deflate.on('error', (err) => rejectFinish(err))
  fileStream.on('error', (err) => rejectFinish(err))

  const session: PosterStreamingSession = {
    exportId,
    filePath,
    fullWidth: payload.fullWidth,
    fullHeight: payload.fullHeight,
    fileStream,
    deflate,
    idatChunks,
    finishPromise,
    resolveFinish,
    rejectFinish
  }

  activePosterSessions.set(exportId, session)
  return { canceled: false, exportId, filePath }
}

/** 写入切片水平条纹行数据 */
export async function writePosterStrip(payload: {
  exportId: string
  stripRow: number
  stripHeight: number
  rgba: Uint8Array | number[]
}): Promise<{ success: boolean; error?: string }> {
  const session = activePosterSessions.get(payload.exportId)
  if (!session) return { success: false, error: '导出任务会话已失效' }

  const rawRgba = Buffer.from(payload.rgba)
  const bytesPerRow = session.fullWidth * 4

  for (let r = 0; r < payload.stripHeight; r++) {
    const rowBuf = Buffer.alloc(1 + bytesPerRow)
    rowBuf[0] = 0 // PNG filter none
    rawRgba.copy(rowBuf, 1, r * bytesPerRow, (r + 1) * bytesPerRow)
    session.deflate.write(rowBuf)
  }

  return { success: true }
}

/** 完成海报导出并封装 PNG */
export async function finishPosterExport(payload: {
  exportId: string
}): Promise<{ success: boolean; filePath: string; sizeBytes: number; error?: string }> {
  const session = activePosterSessions.get(payload.exportId)
  if (!session) return { success: false, filePath: '', sizeBytes: 0, error: '导出任务会话已失效' }

  try {
    session.deflate.end()
    const sizeBytes = await session.finishPromise
    activePosterSessions.delete(payload.exportId)
    return { success: true, filePath: session.filePath, sizeBytes }
  } catch (err) {
    activePosterSessions.delete(payload.exportId)
    return { success: false, filePath: session.filePath, sizeBytes: 0, error: String(err) }
  }
}

/** 取消海报导出并清理临时文件 */
export function cancelPosterExport(payload: { exportId: string }): void {
  const session = activePosterSessions.get(payload.exportId)
  if (!session) return

  try {
    session.deflate.destroy()
    session.fileStream.destroy()
    if (fs.existsSync(session.filePath)) {
      fs.unlinkSync(session.filePath)
    }
  } catch {
    // 忽略清理失败
  }
  activePosterSessions.delete(payload.exportId)
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
        meta: { ...metaContext, stageName: stages.find((s) => s.id === sid)?.name },
        layoutOptions: params.layoutOptions
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
        meta: metaContext,
        layoutOptions: params.layoutOptions
      })
      const name = sanitizeSheetName(
        tch.staffNo ? `${tch.staffNo}_${tch.name}` : tch.name,
        `T_${tch.id}`
      )
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
        meta: metaContext,
        layoutOptions: params.layoutOptions
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
      meta: metaContext,
      layoutOptions: params.layoutOptions
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
        meta: { ...metaContext, stageName: stages.find((s) => s.id === sid)?.name },
        layoutOptions: params.layoutOptions
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
        meta: metaContext,
        layoutOptions: params.layoutOptions
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
        meta: metaContext,
        layoutOptions: params.layoutOptions
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
