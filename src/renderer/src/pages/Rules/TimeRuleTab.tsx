import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@renderer/lib/api'
import { useMetaStore } from '@renderer/stores/metaStore'
import { toast } from '@renderer/stores/toastStore'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import { RuleGrid } from '@renderer/components/rules/RuleGrid'
import { RULE_SCOPE_TYPES, type RuleScopeType, type RuleValue } from '@shared/domain'
import type { RuleScopeSummary } from '@shared/types/entities'

interface Props {
  semesterId: number
}

/** 四层时段规则页：左侧作用域切换 + 右侧调色网格（docs/05 §4.3） */
export function TimeRuleTab({ semesterId }: Props): React.JSX.Element {
  const meta = useMetaStore()
  const [scopeType, setScopeType] = useState<RuleScopeType>('teacher')
  const [scopeId, setScopeId] = useState<number | null>(null)
  const [stageId, setStageId] = useState<number | null>(null)
  const [brush, setBrush] = useState<RuleValue>('FORBIDDEN')
  const [rules, setRules] = useState<Map<number, RuleValue>>(new Map())
  const [summary, setSummary] = useState<RuleScopeSummary[]>([])
  const [loading, setLoading] = useState(false)

  const gradeById = useMemo(() => new Map(meta.grades.map((g) => [g.id, g])), [meta.grades])

  // 作用域候选实体
  const entities = useMemo(() => {
    switch (scopeType) {
      case 'teacher':
        return meta.teachers.filter((t) => t.enabled).map((t) => ({ id: t.id, name: t.name }))
      case 'class':
        return meta.classes.map((c) => ({ id: c.id, name: c.name }))
      case 'subject':
        return meta.subjects.map((s) => ({ id: s.id, name: s.name }))
      case 'grade':
        return meta.grades.map((g) => ({ id: g.id, name: g.name }))
      default:
        return []
    }
  }, [scopeType, meta])

  const summaryMap = useMemo(() => {
    const m = new Map<string, RuleScopeSummary>()
    for (const s of summary) m.set(`${s.scopeType}:${s.scopeId ?? 'null'}`, s)
    return m
  }, [summary])

  const currentSummary = summaryMap.get(`${scopeType}:${scopeId ?? 'null'}`)

  // 默认学段
  useEffect(() => {
    if (stageId == null && meta.stages.length > 0) {
      // 优先落在启用中的学段：示范高完中停用了小学，默认选中它会显示一套用不上的作息
      const first = meta.stages.find((s) => s.enabled) ?? meta.stages[0]
      setStageId(first.id)
    }
  }, [meta.stages, stageId])

  // 切换作用域类型时挑第一个实体
  useEffect(() => {
    if (scopeType === 'global') {
      setScopeId(null)
      return
    }
    setScopeId((prev) => (entities.some((e) => e.id === prev) ? prev : (entities[0]?.id ?? null)))
  }, [scopeType, entities])

  // 班级 / 年级作用域：自动跟随其学段
  useEffect(() => {
    if (scopeId == null) return
    if (scopeType === 'class') {
      const k = meta.classes.find((c) => c.id === scopeId)
      const g = k ? gradeById.get(k.gradeId) : undefined
      if (g) setStageId(g.stageId)
    } else if (scopeType === 'grade') {
      const g = gradeById.get(scopeId)
      if (g) setStageId(g.stageId)
    }
  }, [scopeType, scopeId, meta.classes, gradeById])

  const loadSummary = useCallback(async () => {
    setSummary(await api['timeRule:summary'](semesterId))
  }, [semesterId])

  const loadRules = useCallback(async () => {
    if (scopeType !== 'global' && scopeId == null) {
      setRules(new Map())
      return
    }
    setLoading(true)
    try {
      const rows = await api['timeRule:listByScope'](semesterId, { scopeType, scopeId })
      setRules(new Map(rows.map((r) => [r.slotId, r.ruleValue])))
    } finally {
      setLoading(false)
    }
  }, [semesterId, scopeType, scopeId])

  useEffect(() => {
    void loadRules()
  }, [loadRules])
  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const stage = meta.stages.find((s) => s.id === stageId)
  const slots = stageId != null ? (meta.slotsByStage[stageId] ?? []) : []

  const paint = async (slotIds: number[], value: RuleValue): Promise<void> => {
    if (scopeType !== 'global' && scopeId == null) return
    const patches = slotIds.map((slotId) => ({ slotId, ruleValue: value }))
    // 乐观更新
    setRules((prev) => {
      const next = new Map(prev)
      for (const id of slotIds) {
        if (value === 'NORMAL') next.delete(id)
        else next.set(id, value)
      }
      return next
    })
    try {
      const saved = await api['timeRule:setCells'](semesterId, { scopeType, scopeId }, patches)
      setRules(new Map(saved.map((r) => [r.slotId, r.ruleValue])))
      void loadSummary()
    } catch (err) {
      toast.error(`保存失败：${String(err)}`)
      void loadRules()
    }
  }

  const clearScope = async (): Promise<void> => {
    if (scopeType !== 'global' && scopeId == null) return
    const n = await api['timeRule:clearScope'](semesterId, { scopeType, scopeId })
    await loadRules()
    await loadSummary()
    toast.success(`已清空 ${n} 条规则`)
  }

  /** 教师作用域：应用到同学科教师；班级作用域：应用到同年级班级 */
  const copyToPeers = async (): Promise<void> => {
    if (scopeId == null) return
    let targets: { scopeType: RuleScopeType; scopeId: number | null }[] = []
    let label = ''
    if (scopeType === 'teacher') {
      const me = meta.teachers.find((t) => t.id === scopeId)
      if (!me) return
      const peers = meta.teachers.filter(
        (t) => t.id !== me.id && t.enabled && t.subjectIds.some((s) => me.subjectIds.includes(s))
      )
      targets = peers.map((t) => ({ scopeType: 'teacher' as const, scopeId: t.id }))
      label = `${peers.length} 位同学科教师`
    } else if (scopeType === 'class') {
      const me = meta.classes.find((c) => c.id === scopeId)
      if (!me) return
      const peers = meta.classes.filter((c) => c.id !== me.id && c.gradeId === me.gradeId)
      targets = peers.map((c) => ({ scopeType: 'class' as const, scopeId: c.id }))
      label = `${peers.length} 个同年级班级`
    }
    if (targets.length === 0) {
      toast.info('没有可应用的同类对象')
      return
    }
    if (!window.confirm(`确定把当前规则覆盖到${label}？目标原有规则会被清空。`)) return
    const n = await api['timeRule:copyScope'](semesterId, { scopeType, scopeId }, targets)
    await loadSummary()
    toast.success(`已复制 ${n} 条规则到${label}`)
  }

  const configuredCount = summary.filter((s) => s.scopeType === scopeType).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-[color:var(--text-secondary)]">作用域</label>
          <Select
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as RuleScopeType)}
            className="w-28"
          >
            {RULE_SCOPE_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        {scopeType !== 'global' && (
          <div>
            <label className="mb-1 block text-xs text-[color:var(--text-secondary)]">对象</label>
            <Select
              value={scopeId ?? ''}
              onChange={(e) => setScopeId(Number(e.target.value))}
              className="w-48"
            >
              {entities.length === 0 && <option value="">（暂无）</option>}
              {entities.map((en) => {
                const s = summaryMap.get(`${scopeType}:${en.id}`)
                return (
                  <option key={en.id} value={en.id}>
                    {en.name}
                    {s ? ` ● ${s.ruleCount}` : ''}
                  </option>
                )
              })}
            </Select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-[color:var(--text-secondary)]">
            作息（学段）
          </label>
          <Select
            value={stageId ?? ''}
            onChange={(e) => setStageId(Number(e.target.value))}
            className="w-32"
            disabled={scopeType === 'class' || scopeType === 'grade'}
          >
            {meta.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Badge tone="slate">已配置 {configuredCount} 个对象</Badge>
          {currentSummary && <Badge tone="brand">当前对象 {currentSummary.ruleCount} 条</Badge>}
          {(scopeType === 'teacher' || scopeType === 'class') && (
            <Button variant="outline" size="sm" onClick={copyToPeers}>
              {scopeType === 'teacher' ? '应用到同学科教师' : '应用到同年级班级'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={clearScope}>
            清空
          </Button>
        </div>
      </div>

      <RuleGrid
        slots={slots}
        daysPerWeek={stage?.daysPerWeek ?? 5}
        rules={rules}
        brush={brush}
        onBrushChange={setBrush}
        onPaint={(ids, v) => void paint(ids, v)}
        disabled={loading || (scopeType !== 'global' && scopeId == null)}
      />

      <p className="text-xs text-[color:var(--text-secondary)]">
        规则合并顺序（<code>src/shared/constraints</code>{' '}
        唯一实现）：任一作用域标「禁排」即硬性不可排； 其余取更具体的作用域（教师 &gt; 班级 &gt;
        学科 &gt; 年级 &gt; 全局），同级冲突时取更保守的一方。
      </p>
    </div>
  )
}
