import { ipcMain } from 'electron'
import { timeRuleRepo } from '../db/repositories/timeRuleRepo'
import { subjectRuleRepo } from '../db/repositories/subjectRuleRepo'
import { fixedLessonRepo } from '../db/repositories/fixedLessonRepo'
import { constraintGroupRepo } from '../db/repositories/constraintGroupRepo'
import { teachingTaskRepo } from '../db/repositories/teachingTaskRepo'
import type {
  ConstraintGroupInput,
  FixedLessonInput,
  RuleScopeRef,
  SubjectRulePatch,
  TimeRulePatch
} from '@shared/types/entities'

/** 四层时段规则 / 学科规则 / 预排锁定 / 约束组 —— 「排课规则」页所需的 IPC（M2） */
export function registerRulesIpc(): void {
  // ---- 时段规则（D4 四层） ----
  ipcMain.handle('timeRule:listByScope', (_e, semesterId: number, scope: RuleScopeRef) =>
    timeRuleRepo.listByScope(semesterId, scope)
  )
  ipcMain.handle('timeRule:listBySemester', (_e, semesterId: number) =>
    timeRuleRepo.listBySemester(semesterId)
  )
  ipcMain.handle(
    'timeRule:setCells',
    (_e, semesterId: number, scope: RuleScopeRef, patches: TimeRulePatch[]) =>
      timeRuleRepo.setCells(semesterId, scope, patches)
  )
  ipcMain.handle('timeRule:clearScope', (_e, semesterId: number, scope: RuleScopeRef) =>
    timeRuleRepo.clearScope(semesterId, scope)
  )
  ipcMain.handle(
    'timeRule:copyScope',
    (_e, semesterId: number, from: RuleScopeRef, targets: RuleScopeRef[]) =>
      timeRuleRepo.copyScope(semesterId, from, targets)
  )
  ipcMain.handle('timeRule:summary', (_e, semesterId: number) => timeRuleRepo.summary(semesterId))

  // ---- 学科规则 ----
  ipcMain.handle('subjectRule:save', (_e, patches: SubjectRulePatch[]) =>
    subjectRuleRepo.saveRules(patches)
  )
  ipcMain.handle('subjectRule:listClassrooms', () => subjectRuleRepo.listClassrooms())
  ipcMain.handle(
    'subjectRule:setClassrooms',
    (
      _e,
      subjectId: number,
      bindings: { classroomId: number; slotsTaken: number; priority: number }[]
    ) => subjectRuleRepo.setClassrooms(subjectId, bindings)
  )
  ipcMain.handle(
    'subjectRule:applyConsecutive',
    (
      _e,
      payload: {
        semesterId: number
        subjectId: number
        gradeIds?: number[]
        consecutiveCount: number
        consecutiveSize: number
      }
    ) =>
      teachingTaskRepo.setConsecutive(
        payload.semesterId,
        payload.subjectId,
        payload.gradeIds,
        payload.consecutiveCount,
        payload.consecutiveSize
      )
  )

  // ---- 预排锁定 ----
  ipcMain.handle('fixedLesson:list', (_e, semesterId: number) =>
    fixedLessonRepo.listBySemester(semesterId)
  )
  ipcMain.handle('fixedLesson:upsert', (_e, payload: FixedLessonInput) =>
    fixedLessonRepo.upsert(payload)
  )
  ipcMain.handle('fixedLesson:delete', (_e, id: number) => fixedLessonRepo.delete(id))
  ipcMain.handle('fixedLesson:bulkCreate', (_e, payloads: FixedLessonInput[]) =>
    fixedLessonRepo.bulkCreate(payloads)
  )
  ipcMain.handle('fixedLesson:conflicts', (_e, semesterId: number) =>
    fixedLessonRepo.conflicts(semesterId)
  )

  // ---- 约束组 ----
  ipcMain.handle('constraintGroup:list', (_e, semesterId: number) =>
    constraintGroupRepo.listBySemester(semesterId)
  )
  ipcMain.handle('constraintGroup:upsert', (_e, payload: ConstraintGroupInput) =>
    constraintGroupRepo.upsert(payload)
  )
  ipcMain.handle('constraintGroup:delete', (_e, id: number) => constraintGroupRepo.delete(id))
}
