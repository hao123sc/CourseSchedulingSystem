import type { SolverSlot } from '../model/types'

const FIRST_FORMAL_NAME = /^第\s*0*1\s*节$/
const NON_FORMAL_NAME = /早读|早自习|晨读|晚读|晚自习/

/** 学段 + 星期组成的键；不同学段可以有完全不同的作息。 */
export function stageDayKey(stageId: number, dayOfWeek: number): string {
  return `${stageId}:${dayOfWeek}`
}

/**
 * 找出每个学段、每天的第一节正课。
 *
 * 十二年一贯制学校的高中作息常把“早读”设成 teaching slot，不能因此把早读
 * 当作第一节正课。优先认显式的“第1节”；旧数据没有标准名称时，再退回到
 * 最早的非早读、非晚自习教学槽。
 */
export function firstFormalSlotIds(slots: readonly SolverSlot[]): Map<string, number> {
  const grouped = new Map<string, SolverSlot[]>()
  for (const slot of slots) {
    if (!slot.isTeaching) continue
    const k = stageDayKey(slot.stageId, slot.dayOfWeek)
    const group = grouped.get(k) ?? []
    group.push(slot)
    grouped.set(k, group)
  }

  const result = new Map<string, number>()
  for (const [k, group] of grouped) {
    const ordered = [...group].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.periodIndex - b.periodIndex || a.id - b.id
    )
    const named = ordered.find((slot) => FIRST_FORMAL_NAME.test(slot.periodName.trim()))
    const fallback = ordered.find(
      (slot) => slot.segment !== 'evening' && !NON_FORMAL_NAME.test(slot.periodName)
    )
    const first = named ?? fallback ?? ordered[0]
    if (first) result.set(k, first.id)
  }
  return result
}
