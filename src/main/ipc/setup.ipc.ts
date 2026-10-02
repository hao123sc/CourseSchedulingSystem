import { ipcMain } from 'electron'
import { schoolRepo } from '../db/repositories/schoolRepo'
import { semesterRepo } from '../db/repositories/semesterRepo'
import { stageRepo } from '../db/repositories/stageRepo'
import { weightProfileRepo } from '../db/repositories/weightProfileRepo'
import type { PeriodTemplate, SchoolInput, SemesterInput, StageInput } from '@shared/types/entities'

/** 学校 / 学期 / 学段 / 作息 / 风格档位 —— 「学校设置」页所需的 IPC */
export function registerSetupIpc(): void {
  // 学校
  ipcMain.handle('school:get', () => schoolRepo.get())
  ipcMain.handle('school:save', (_e, payload: SchoolInput) => schoolRepo.save(payload))

  // 学期
  ipcMain.handle('semester:list', () => semesterRepo.list())
  ipcMain.handle('semester:getCurrent', () => semesterRepo.getCurrent())
  ipcMain.handle('semester:upsert', (_e, payload: SemesterInput) => semesterRepo.upsert(payload))
  ipcMain.handle('semester:delete', (_e, id: number) => semesterRepo.delete(id))
  ipcMain.handle('semester:setCurrent', (_e, id: number) => semesterRepo.setCurrent(id))

  // 学段
  ipcMain.handle('stage:list', () => stageRepo.list())
  ipcMain.handle('stage:upsert', (_e, payload: StageInput) => stageRepo.upsert(payload))
  ipcMain.handle('stage:delete', (_e, id: number) => stageRepo.delete(id))

  // 作息
  ipcMain.handle('timeSlot:listByStage', (_e, stageId: number) => stageRepo.listSlots(stageId))
  ipcMain.handle('timeSlot:replaceForStage', (_e, stageId: number, periods: PeriodTemplate[]) =>
    stageRepo.replaceSlots(stageId, periods)
  )

  // 风格权重档位（只读）
  ipcMain.handle('weightProfile:list', () => weightProfileRepo.list())
}
