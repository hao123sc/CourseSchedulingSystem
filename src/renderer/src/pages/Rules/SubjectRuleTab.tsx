import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@renderer/lib/api'
import { useMetaStore } from '@renderer/stores/metaStore'
import { toast } from '@renderer/stores/toastStore'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import { Modal } from '@renderer/components/ui/modal'
import { cn } from '@renderer/lib/utils'
import { WEEK_SPREADS, type WeekSpread } from '@shared/domain'
import type { SubjectClassroom, SubjectRulePatch, TeachingTask } from '@shared/types/entities'

interface Props {
  semesterId: number
}

interface Draft {
  dailyMax: number
  weekSpread: WeekSpread
  importance: number
  needSpecialRoom: boolean
}

/**
 * 学科规则：每日上限 / 分布策略 / 重要性 / 专用场地绑定 + 连堂批量下发。
 *
 * 说明：连堂按 docs/03 存在 `teaching_task.consecutive_*`（任务级属性），
 * 这里提供「按学科批量下发到教学任务」的入口，不在 subject 表加冗余列。
 */
export function SubjectRuleTab({ semesterId }: Props): React.JSX.Element {
  const meta = useMetaStore()
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [bindings, setBindings] = useState<SubjectClassroom[]>([])
  const [tasks, setTasks] = useState<TeachingTask[]>([])
  const [roomEditor, setRoomEditor] = useState<number | null>(null)
  const [consecEditor, setConsecEditor] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [b, t] = await Promise.all([
      api['subjectRule:listClassrooms'](),
      api['task:list'](semesterId)
    ])
    setBindings(b)
    setTasks(t)
  }, [semesterId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        meta.subjects.map((s) => [
          s.id,
          {
            dailyMax: s.dailyMax,
            weekSpread: s.weekSpread,
            importance: s.importance,
            needSpecialRoom: s.needSpecialRoom
          }
        ])
      )
    )
  }, [meta.subjects])

  const usage = useMemo(() => {
    const m = new Map<number, { periods: number; classes: number; consec: string }>()
    for (const t of tasks) {
      const cur = m.get(t.subjectId) ?? { periods: 0, classes: 0, consec: '' }
      cur.periods += t.weeklyPeriods
      cur.classes += 1
      if (t.consecutiveCount > 0) cur.consec = `${t.consecutiveCount}×${t.consecutiveSize}`
      m.set(t.subjectId, cur)
    }
    return m
  }, [tasks])

  const bindingMap = useMemo(() => {
    const m = new Map<number, SubjectClassroom[]>()
    for (const b of bindings) {
      const arr = m.get(b.subjectId) ?? []
      arr.push(b)
      m.set(b.subjectId, arr)
    }
    return m
  }, [bindings])

  const dirty = useMemo(
    () =>
      meta.subjects.some((s) => {
        const d = drafts[s.id]
        if (!d) return false
        return (
          d.dailyMax !== s.dailyMax ||
          d.weekSpread !== s.weekSpread ||
          d.importance !== s.importance ||
          d.needSpecialRoom !== s.needSpecialRoom
        )
      }),
    [meta.subjects, drafts]
  )

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const patches: SubjectRulePatch[] = meta.subjects
        .filter((s) => drafts[s.id])
        .map((s) => ({ subjectId: s.id, ...drafts[s.id] }))
      await api['subjectRule:save'](patches)
      await meta.reloadSubjects()
      toast.success(`已保存 ${patches.length} 个学科的规则`)
    } catch (err) {
      toast.error(`保存失败：${String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const set = (id: number, patch: Partial<Draft>): void =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-[color:var(--text-secondary)]">
          每日上限用于软约束 S1（同班同科同日超限），分布策略与重要性影响 S2 / S3 / S10
        </p>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <Badge tone="amber">有未保存修改</Badge>}
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? '保存中…' : '保存学科规则'}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-[color:var(--border-subtle)]">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs dark:bg-slate-800/60">
            <tr>
              <Th>学科</Th>
              <Th>本学期用量</Th>
              <Th>每日上限</Th>
              <Th>周内分布</Th>
              <Th>重要性</Th>
              <Th>需专用教室</Th>
              <Th>可用场地</Th>
              <Th>连堂</Th>
            </tr>
          </thead>
          <tbody>
            {meta.subjects.map((s) => {
              const d = drafts[s.id]
              if (!d) return null
              const u = usage.get(s.id)
              const binds = bindingMap.get(s.id) ?? []
              const needsRoomButUnbound = d.needSpecialRoom && binds.length === 0 && u != null
              return (
                <tr
                  key={s.id}
                  className="border-t border-[color:var(--border-subtle)] hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.name}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-[color:var(--text-secondary)]">
                    {u ? `${u.classes} 班 / ${u.periods} 节` : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={d.dailyMax}
                      onChange={(e) => set(s.id, { dailyMax: Math.max(1, Number(e.target.value)) })}
                      className="h-7 w-14 rounded-input border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-1 text-center tabular-nums outline-none focus:ring-1 focus:ring-brand-600"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Select
                      value={d.weekSpread}
                      onChange={(e) => set(s.id, { weekSpread: e.target.value as WeekSpread })}
                      className="h-7 w-20 text-xs"
                    >
                      {WEEK_SPREADS.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => set(s.id, { importance: n })}
                          className={cn(
                            'h-5 w-5 rounded text-[10px] transition-colors',
                            n <= d.importance
                              ? 'bg-brand-600 text-white'
                              : 'bg-slate-100 text-slate-400 dark:bg-slate-700'
                          )}
                          title={`重要性 ${n}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={d.needSpecialRoom}
                      onChange={(e) => set(s.id, { needSpecialRoom: e.target.checked })}
                      className="h-4 w-4 accent-brand-600"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => setRoomEditor(s.id)}
                      className={cn(
                        'rounded-btn px-2 py-0.5 text-xs underline-offset-2 hover:underline',
                        needsRoomButUnbound
                          ? 'text-red-600 dark:text-red-300'
                          : 'text-brand-700 dark:text-brand-100'
                      )}
                    >
                      {binds.length > 0
                        ? `${binds.length} 处`
                        : needsRoomButUnbound
                          ? '未绑定！'
                          : '设置'}
                    </button>
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => setConsecEditor(s.id)}
                      className="rounded-btn px-2 py-0.5 text-xs text-brand-700 underline-offset-2 hover:underline dark:text-brand-100"
                    >
                      {u?.consec ? u.consec : '设置'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {roomEditor != null && (
        <RoomBindingModal
          subjectId={roomEditor}
          bindings={bindingMap.get(roomEditor) ?? []}
          onClose={() => setRoomEditor(null)}
          onSaved={() => {
            setRoomEditor(null)
            void load()
          }}
        />
      )}

      {consecEditor != null && (
        <ConsecutiveModal
          semesterId={semesterId}
          subjectId={consecEditor}
          onClose={() => setConsecEditor(null)}
          onSaved={() => {
            setConsecEditor(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <th className="px-3 py-2 text-left font-semibold">{children}</th>
}

/** 学科 → 可用专用教室（含班位占用数 slots_taken，对应 H3 并发容量） */
function RoomBindingModal({
  subjectId,
  bindings,
  onClose,
  onSaved
}: {
  subjectId: number
  bindings: SubjectClassroom[]
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const meta = useMetaStore()
  const subject = meta.subjects.find((s) => s.id === subjectId)
  const [rows, setRows] = useState(
    () =>
      new Map(
        bindings.map((b) => [b.classroomId, { slotsTaken: b.slotsTaken, priority: b.priority }])
      )
  )

  const toggle = (id: number): void =>
    setRows((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, { slotsTaken: 1, priority: 0 })
      return next
    })

  const save = async (): Promise<void> => {
    await api['subjectRule:setClassrooms'](
      subjectId,
      [...rows.entries()].map(([classroomId, v]) => ({ classroomId, ...v }))
    )
    toast.success(`已保存「${subject?.name}」的场地绑定`)
    onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${subject?.name ?? ''} · 可用专用场地`}
      description="勾选该学科可以使用的场地；「班位」指这门课在该场地占几个并发名额（如足球占 2）"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={save}>保存</Button>
        </>
      }
    >
      <ul className="flex flex-col gap-1">
        {meta.classrooms
          .filter((c) => c.enabled)
          .map((c) => {
            const on = rows.has(c.id)
            const v = rows.get(c.id)
            return (
              <li
                key={c.id}
                className={cn(
                  'flex items-center gap-2 rounded-btn border px-2 py-1.5 text-sm',
                  on
                    ? 'border-brand-600 bg-brand-50 dark:bg-brand-600/10'
                    : 'border-[color:var(--border-subtle)]'
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(c.id)}
                  className="h-4 w-4 accent-brand-600"
                />
                <span className="flex-1 truncate">{c.name}</span>
                <Badge tone={c.concurrentCapacity > 1 ? 'green' : 'slate'}>
                  {c.concurrentCapacity > 1 ? `并发 ${c.concurrentCapacity}` : '独占'}
                </Badge>
                <span className="text-xs text-[color:var(--text-secondary)]">{c.capacity} 座</span>
                {on && v && (
                  <>
                    <label className="text-xs text-[color:var(--text-secondary)]">班位</label>
                    <input
                      type="number"
                      min={1}
                      max={c.concurrentCapacity}
                      value={v.slotsTaken}
                      onChange={(e) =>
                        setRows((prev) => {
                          const next = new Map(prev)
                          next.set(c.id, { ...v, slotsTaken: Math.max(1, Number(e.target.value)) })
                          return next
                        })
                      }
                      className="h-6 w-12 rounded border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-1 text-center text-xs tabular-nums"
                    />
                    <label className="text-xs text-[color:var(--text-secondary)]">优先级</label>
                    <input
                      type="number"
                      min={0}
                      max={9}
                      value={v.priority}
                      onChange={(e) =>
                        setRows((prev) => {
                          const next = new Map(prev)
                          next.set(c.id, { ...v, priority: Number(e.target.value) })
                          return next
                        })
                      }
                      className="h-6 w-12 rounded border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-1 text-center text-xs tabular-nums"
                    />
                  </>
                )}
              </li>
            )
          })}
      </ul>
    </Modal>
  )
}

/** 连堂批量下发 */
function ConsecutiveModal({
  semesterId,
  subjectId,
  onClose,
  onSaved
}: {
  semesterId: number
  subjectId: number
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const meta = useMetaStore()
  const subject = meta.subjects.find((s) => s.id === subjectId)
  const [count, setCount] = useState(1)
  const [size, setSize] = useState(2)
  const [gradeIds, setGradeIds] = useState<number[]>([])

  const apply = async (): Promise<void> => {
    const n = await api['subjectRule:applyConsecutive']({
      semesterId,
      subjectId,
      gradeIds: gradeIds.length > 0 ? gradeIds : undefined,
      consecutiveCount: count,
      consecutiveSize: size
    })
    toast.success(`已为 ${n} 条教学任务设置连堂 ${count}×${size}`)
    onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${subject?.name ?? ''} · 连堂设置`}
      description="连堂是任务级属性，这里批量下发到该学科的教学任务（H10：块内节次必须相邻同日、不跨上下午）"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={apply}>应用</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-20">连堂组数</span>
          <input
            type="number"
            min={0}
            max={5}
            value={count}
            onChange={(e) => setCount(Math.max(0, Number(e.target.value)))}
            className="h-8 w-20 rounded-input border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-2 text-center tabular-nums"
          />
          <span className="w-20 text-right">每组节数</span>
          <input
            type="number"
            min={2}
            max={4}
            value={size}
            onChange={(e) => setSize(Math.max(2, Number(e.target.value)))}
            className="h-8 w-20 rounded-input border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-2 text-center tabular-nums"
          />
        </div>
        <p className="text-xs text-[color:var(--text-secondary)]">
          设 0 组表示取消连堂。共占用 {count * size} 节，不得超过该任务的周课时。
        </p>
        <div>
          <div className="mb-1 text-xs text-[color:var(--text-secondary)]">
            限定年级（不选＝全校）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {meta.grades.map((g) => {
              const on = gradeIds.includes(g.id)
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() =>
                    setGradeIds((prev) =>
                      prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id]
                    )
                  }
                  className={cn(
                    'rounded-btn border px-2 py-0.5 text-xs',
                    on
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                      : 'border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]'
                  )}
                >
                  {g.name}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}
