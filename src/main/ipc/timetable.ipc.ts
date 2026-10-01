import { ipcMain } from 'electron'
import { adjustLessonSlot, getVersionLessons } from '../services/scheduleResultService'
import { exportTimetable, savePosterImage } from '../services/excelService'
import type { TimetableExportParams } from '@shared/types/ipc'

/**
 * 课表页（M4/M7/M9）：版本课表行、本地换课持久化、课表 Excel 导出与大幅面海报图片保存。
 */
export function registerTimetableIpc(): void {
  ipcMain.handle('timetable:versionLessons', (_e, versionId: number) =>
    getVersionLessons(versionId)
  )
  ipcMain.handle(
    'timetable:moveLesson',
    (
      _e,
      payload: {
        versionId: number
        lessonId: number
        toSlotId: number
        reason?: string
      }
    ) => adjustLessonSlot(payload)
  )
  ipcMain.handle('timetable:exportExcel', (_e, params: TimetableExportParams) =>
    exportTimetable(params)
  )
  ipcMain.handle(
    'timetable:savePosterImage',
    (_e, payload: { defaultName: string; base64Data: string }) => savePosterImage(payload)
  )
}
