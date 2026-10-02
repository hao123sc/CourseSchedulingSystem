import { ipcMain } from 'electron'
import { teachingTaskRepo } from '../db/repositories/teachingTaskRepo'
import type { MatrixCellPatch, TeachingTaskInput } from '@shared/types/entities'

/** 教学任务矩阵 / 课时方案套用 / 教师工作量 —— 「教学任务」页所需的 IPC（M2） */
export function registerTeachingIpc(): void {
  ipcMain.handle('task:list', (_e, semesterId: number) =>
    teachingTaskRepo.listBySemester(semesterId)
  )
  ipcMain.handle('task:upsert', (_e, payload: TeachingTaskInput) =>
    teachingTaskRepo.upsert(payload)
  )
  ipcMain.handle('task:delete', (_e, id: number) => teachingTaskRepo.delete(id))

  ipcMain.handle('task:applyMatrix', (_e, semesterId: number, patches: MatrixCellPatch[]) =>
    teachingTaskRepo.applyMatrix(semesterId, patches)
  )
  ipcMain.handle(
    'task:assignTeacher',
    (
      _e,
      semesterId: number,
      cells: { classId: number; subjectId: number }[],
      teacherId: number | null
    ) => teachingTaskRepo.assignTeacher(semesterId, cells, teacherId)
  )
  ipcMain.handle('task:clear', (_e, semesterId: number, gradeIds?: number[]) =>
    teachingTaskRepo.clear(semesterId, gradeIds)
  )
  ipcMain.handle(
    'task:applyCurriculum',
    (
      _e,
      payload: {
        semesterId: number
        planCode: string
        gradeIds: number[]
        overwrite: boolean
        entries?: { subject: string; periods: number }[]
      }
    ) => teachingTaskRepo.applyCurriculum(payload)
  )
  ipcMain.handle('task:workloads', (_e, semesterId: number) =>
    teachingTaskRepo.workloads(semesterId)
  )
}
