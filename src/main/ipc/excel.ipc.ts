import { ipcMain } from 'electron'
import {
  exportTeachers,
  importTeachers,
  exportClasses,
  importClasses,
  exportClassrooms,
  importClassrooms
} from '../services/excelService'

/** 教师 / 班级 / 教室 的 Excel 导入导出 IPC */
export function registerExcelIpc(): void {
  ipcMain.handle('teacher:exportExcel', () => exportTeachers())
  ipcMain.handle('teacher:importExcel', () => importTeachers())
  ipcMain.handle('class:exportExcel', (_e, semesterId: number) => exportClasses(semesterId))
  ipcMain.handle('class:importExcel', (_e, semesterId: number) => importClasses(semesterId))
  ipcMain.handle('classroom:exportExcel', () => exportClassrooms())
  ipcMain.handle('classroom:importExcel', () => importClassrooms())
}
