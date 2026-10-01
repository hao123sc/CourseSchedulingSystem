/** 可组合的解变换算子。所有操作都保存旧值，apply/undo 必须幂等可逆。 */
import type { SolverContext } from './context'
import type { Assignment, Solution } from '../model/solution'

export type MoveKind = 'move' | 'swap' | 'blockMove' | 'kempe' | 'ruinRecreate'

export interface Move {
  readonly kind: MoveKind
  readonly changedUnitIds: readonly number[]
  apply(solution: Solution): void
  undo(solution: Solution): void
}

function copy(a: Assignment): Assignment {
  return { ...a, slotIds: [...a.slotIds], roomIds: [...a.roomIds] }
}
function replaceAssignments(
  kind: MoveKind,
  ids: number[],
  before: Map<number, Assignment>,
  after: Map<number, Assignment>
): Move {
  return {
    kind,
    changedUnitIds: ids,
    apply(solution) {
      for (const id of ids) {
        const value = after.get(id)
        if (value) solution.assignments.set(id, copy(value))
        else solution.assignments.delete(id)
      }
    },
    undo(solution) {
      for (const id of ids) {
        const value = before.get(id)
        if (value) solution.assignments.set(id, copy(value))
        else solution.assignments.delete(id)
      }
    }
  }
}

export function move(
  ctx: SolverContext,
  solution: Solution,
  unitId: number,
  slotIds: readonly number[],
  roomIds?: readonly (number | null)[]
): Move {
  const current = solution.assignments.get(unitId)
  const unit = ctx.units[unitId]
  if (!unit || !current || slotIds.length !== unit.size)
    throw new Error(`invalid move for unit ${unitId}`)
  const next: Assignment = {
    ...current,
    slotId: slotIds[0],
    slotIds: [...slotIds],
    roomIds: roomIds ? [...roomIds] : [...current.roomIds],
    roomId: roomIds?.[0] ?? current.roomId
  }
  return replaceAssignments(
    'move',
    [unitId],
    new Map([[unitId, current]]),
    new Map([[unitId, next]])
  )
}

export function blockMove(
  ctx: SolverContext,
  solution: Solution,
  unitId: number,
  slotIds: readonly number[],
  roomIds?: readonly (number | null)[]
): Move {
  return { ...move(ctx, solution, unitId, slotIds, roomIds), kind: 'blockMove' }
}

export function swap(solution: Solution, firstUnitId: number, secondUnitId: number): Move {
  const first = solution.assignments.get(firstUnitId)
  const second = solution.assignments.get(secondUnitId)
  if (!first || !second) throw new Error('cannot swap an unassigned unit')
  // 交换的是时间位置，不交换每个单元绑定的场地；否则普通班固定教室会被
  // 质量优化偷偷换走，且拼合组的逐班场地映射也会失真。
  const a = { ...first, slotId: second.slotId, slotIds: [...second.slotIds] }
  const b = { ...second, slotId: first.slotId, slotIds: [...first.slotIds] }
  return replaceAssignments(
    'swap',
    [firstUnitId, secondUnitId],
    new Map([
      [firstUnitId, first],
      [secondUnitId, second]
    ]),
    new Map([
      [firstUnitId, a],
      [secondUnitId, b]
    ])
  )
}

/** 在两个槽之间交换同一 Kempe 连通分量。连通关系由共享班级/教师定义。 */
export function kempe(
  ctx: SolverContext,
  solution: Solution,
  rootUnitId: number,
  firstSlotId: number,
  secondSlotId: number
): Move {
  const related = new Set<number>([rootUnitId])
  const touches = (a: number, b: number): boolean => {
    const x = ctx.units[a]
    const y = ctx.units[b]
    return (
      x.classIds.some((id) => y.classIds.includes(id)) ||
      x.teacherIds.some((id) => y.teacherIds.includes(id))
    )
  }
  const occupying = (id: number): boolean =>
    solution.assignments.get(id)?.slotIds.some((s) => s === firstSlotId || s === secondSlotId) ??
    false
  let changed = true
  while (changed) {
    changed = false
    for (const id of solution.assignments.keys()) {
      if (
        !related.has(id) &&
        occupying(id) &&
        [...related].some((r) => occupying(r) && touches(id, r))
      ) {
        related.add(id)
        changed = true
      }
    }
  }
  const before = new Map<number, Assignment>()
  const after = new Map<number, Assignment>()
  for (const id of related) {
    const value = solution.assignments.get(id)
    if (!value) continue
    before.set(id, value)
    const slots = value.slotIds.map((s) =>
      s === firstSlotId ? secondSlotId : s === secondSlotId ? firstSlotId : s
    )
    after.set(id, { ...value, slotId: slots[0], slotIds: slots })
  }
  return replaceAssignments('kempe', [...before.keys()], before, after)
}

/** 破坏后修复：将指定单元删除并按 replacement 一次性插回。 */
export function ruinRecreate(
  solution: Solution,
  removedUnitIds: readonly number[],
  replacement: ReadonlyMap<number, Assignment>
): Move {
  const before = new Map<number, Assignment>()
  const after = new Map<number, Assignment>()
  for (const id of removedUnitIds) {
    const old = solution.assignments.get(id)
    if (old) before.set(id, old)
    const next = replacement.get(id)
    if (next) after.set(id, next)
  }
  return replaceAssignments(
    'ruinRecreate',
    [...new Set([...removedUnitIds, ...replacement.keys()])],
    before,
    after
  )
}

/** 最小代价指派，返回每行选择的列；方阵/长方阵均可，未匹配行为 -1。 */
export function hungarian(cost: readonly (readonly number[])[]): number[] {
  const n = cost.length
  const m = Math.max(0, ...cost.map((row) => row.length))
  if (!n || !m) return Array(n).fill(-1)
  const u = Array(n + 1).fill(0)
  const v = Array(m + 1).fill(0)
  const p = Array(m + 1).fill(0)
  const way = Array(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = Array(m + 1).fill(Infinity)
    const used = Array(m + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue
        const cur = (cost[i0 - 1]?.[j - 1] ?? 1e12) - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }
  const result = Array(n).fill(-1)
  for (let j = 1; j <= m; j++) if (p[j] > 0 && p[j] <= n) result[p[j] - 1] = j - 1
  return result
}
