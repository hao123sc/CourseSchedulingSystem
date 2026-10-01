import { ipcMain } from 'electron'
import { adjustLessonSlot, getVersionLessons } from '../services/scheduleResultService'
import { exportTimetable } from '../services/excelService'
import type { TimetableExportParams } from '@shared/types/ipc'

/**
 * 课表页（M4/M7）：版本课表行、本地换课持久化、课表 Excel 导出。
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
}
