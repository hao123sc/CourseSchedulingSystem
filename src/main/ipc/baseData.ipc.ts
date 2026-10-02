import { ipcMain } from 'electron'
import { gradeRepo } from '../db/repositories/gradeRepo'
import { classRepo } from '../db/repositories/classRepo'
import { subjectRepo } from '../db/repositories/subjectRepo'
import { teacherRepo } from '../db/repositories/teacherRepo'
import { classroomRepo } from '../db/repositories/classroomRepo'
import type {
  ClassBatchInput,
  ClassroomInput,
  GradeInput,
  KlassInput,
  SubjectInput,
  TeacherInput
} from '@shared/types/entities'

/** 年级 / 班级 / 学科 / 教师 / 教室 —— 「基础数据」页所需的 IPC */
export function registerBaseDataIpc(): void {
  // 年级
  ipcMain.handle('grade:list', (_e, semesterId: number) => gradeRepo.list(semesterId))
  ipcMain.handle('grade:upsert', (_e, payload: GradeInput) => gradeRepo.upsert(payload))
  ipcMain.handle('grade:delete', (_e, id: number) => gradeRepo.delete(id))

  // 班级
  ipcMain.handle('class:listByGrade', (_e, gradeId: number) => classRepo.listByGrade(gradeId))
  ipcMain.handle('class:listBySemester', (_e, semesterId: number) =>
    classRepo.listBySemester(semesterId)
  )
  ipcMain.handle('class:upsert', (_e, payload: KlassInput) => classRepo.upsert(payload))
  ipcMain.handle('class:delete', (_e, id: number) => classRepo.delete(id))
  ipcMain.handle('class:batchCreate', (_e, payload: ClassBatchInput) =>
    classRepo.batchCreate(payload)
  )

  // 学科
  ipcMain.handle('subject:list', () => subjectRepo.list())
  ipcMain.handle('subject:upsert', (_e, payload: SubjectInput) => subjectRepo.upsert(payload))
  ipcMain.handle('subject:delete', (_e, id: number) => subjectRepo.delete(id))

  // 教师
  ipcMain.handle('teacher:list', () => teacherRepo.list())
  ipcMain.handle('teacher:upsert', (_e, payload: TeacherInput) => teacherRepo.upsert(payload))
  ipcMain.handle('teacher:delete', (_e, id: number) => teacherRepo.delete(id))

  // 教室
  ipcMain.handle('classroom:list', () => classroomRepo.list())
  ipcMain.handle('classroom:upsert', (_e, payload: ClassroomInput) => classroomRepo.upsert(payload))
  ipcMain.handle('classroom:delete', (_e, id: number) => classroomRepo.delete(id))
}
