import { ipcMain } from 'electron'
import { getVersionLessons } from '../services/scheduleResultService'

/**
 * 课表页（M4）：版本课表行。
 * 预排无学科占位（升旗/早读/晚自习）不产生 lesson 行，
 * 由渲染端用 fixedLesson:list 叠加显示——两份数据合起来才是完整课表。
 */
export function registerTimetableIpc(): void {
  ipcMain.handle('timetable:versionLessons', (_e, versionId: number) =>
    getVersionLessons(versionId)
  )
}
