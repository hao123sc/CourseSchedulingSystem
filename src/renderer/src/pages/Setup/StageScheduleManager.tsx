import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import { Modal } from '@renderer/components/ui/modal'
import { toast } from '@renderer/stores/toastStore'
import { SEGMENTS, labelOf } from '@shared/domain'
import type { PeriodTemplate, Stage, StageInput, TimeSlot } from '@shared/types/entities'
import type { Segment } from '@shared/domain'

function slotsToTemplate(slots: TimeSlot[]): PeriodTemplate[] {
  return slots
    .filter((s) => s.dayOfWeek === 1)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.periodIndex - b.periodIndex)
    .map((s) => ({
      periodIndex: s.periodIndex,
      periodName: s.periodName,
      segment: s.segment,
      startTime: s.startTime,
      endTime: s.endTime,
      isTeaching: s.isTeaching
    }))
}

export function StageScheduleManager(): React.JSX.Element {
  const [stages, setStages] = useState<Stage[]>([])
  const [editStage, setEditStage] = useState<Stage | 'new' | null>(null)
  const [scheduleStage, setScheduleStage] = useState<Stage | null>(null)

  async function reload(): Promise<void> {
    setStages(await api['stage:list']())
  }
  useEffect(() => {
    void reload()
  }, [])

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>学段与作息</CardTitle>
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
            每个学段有独立的「星期 × 节次」作息，可增删学段并编辑各自的上课节次
          </p>
        </div>
        <Button size="sm" onClick={() => setEditStage('new')}>
          + 新增学段
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {stages.length === 0 && (
          <p className="py-6 text-center text-sm text-[color:var(--text-secondary)]">暂无学段</p>
        )}
        {stages.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-btn border border-[color:var(--border-subtle)] px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{s.name}</span>
              <Badge tone="slate">{s.code}</Badge>
              <span className="text-sm text-[color:var(--text-secondary)]">
                {s.daysPerWeek} 天/周
              </span>
              {s.hasEvening && <Badge tone="brand">含晚自习</Badge>}
              {!s.enabled && <Badge tone="amber">已停用</Badge>}
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setScheduleStage(s)}>
                编辑作息
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditStage(s)}>
                编辑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={async () => {
                  if (!confirm(`确认删除学段「${s.name}」？其作息、关联年级将一并删除。`)) return
                  await api['stage:delete'](s.id)
                  toast.success('已删除学段')
                  void reload()
                }}
              >
                删除
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      {editStage && (
        <StageEditModal
          stage={editStage === 'new' ? null : editStage}
          onClose={() => setEditStage(null)}
          onSaved={() => {
            setEditStage(null)
            void reload()
          }}
        />
      )}
      {scheduleStage && (
        <ScheduleEditModal
          stage={scheduleStage}
          onClose={() => setScheduleStage(null)}
          onSaved={() => setScheduleStage(null)}
        />
      )}
    </Card>
  )
}

function StageEditModal({
  stage,
  onClose,
  onSaved
}: {
  stage: Stage | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<StageInput>({
    id: stage?.id,
    code: stage?.code ?? '',
    name: stage?.name ?? '',
    daysPerWeek: stage?.daysPerWeek ?? 5,
    hasEvening: stage?.hasEvening ?? false,
    enabled: stage?.enabled ?? true
  })
  const [busy, setBusy] = useState(false)

  async function save(): Promise<void> {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('学段名称与代码不能为空')
      return
    }
    setBusy(true)
    try {
      await api['stage:upsert'](form)
      toast.success('已保存学段')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={stage ? '编辑学段' : '新增学段'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            保存
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>名称</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="如 初中"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>代码</Label>
          <Input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="如 junior"
            disabled={Boolean(stage)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>每周天数</Label>
          <Select
            value={form.daysPerWeek}
            onChange={(e) => setForm({ ...form, daysPerWeek: Number(e.target.value) })}
          >
            <option value={5}>5 天</option>
            <option value={6}>6 天</option>
            <option value={7}>7 天</option>
          </Select>
        </div>
        <div className="flex items-end gap-4 pb-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={form.hasEvening ?? false}
              onChange={(e) => setForm({ ...form, hasEvening: e.target.checked })}
            />
            含晚自习
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={form.enabled ?? true}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            启用
          </label>
        </div>
      </div>
      {!stage && (
        <p className="mt-3 text-xs text-[color:var(--text-secondary)]">
          新增学段后请点「编辑作息」录入节次；也可复制内置学段的作息作为起点。
        </p>
      )}
    </Modal>
  )
}

function ScheduleEditModal({
  stage,
  onClose,
  onSaved
}: {
  stage: Stage
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [rows, setRows] = useState<PeriodTemplate[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const slots = await api['timeSlot:listByStage'](stage.id)
      setRows(slotsToTemplate(slots))
    })()
  }, [stage.id])

  function update(i: number, patch: Partial<PeriodTemplate>): void {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addRow(): void {
    const nextIndex = rows.length ? Math.max(...rows.map((r) => r.periodIndex)) + 1 : 1
    setRows([
      ...rows,
      {
        periodIndex: nextIndex,
        periodName: `第${nextIndex}节`,
        segment: 'morning',
        isTeaching: true
      }
    ])
  }
  function removeRow(i: number): void {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function save(): Promise<void> {
    setBusy(true)
    try {
      // 归一化 periodIndex 为连续序号，避免手工留空
      const normalized = rows.map((r, i) => ({ ...r, periodIndex: i + 1 }))
      await api['timeSlot:replaceForStage'](stage.id, normalized)
      toast.success(
        `已保存「${stage.name}」作息（${normalized.length} 节 × ${stage.daysPerWeek} 天）`
      )
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`编辑作息 · ${stage.name}`}
      description={`该模板将复制到每周 ${stage.daysPerWeek} 天。共 ${rows.length} 节/天。`}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            保存作息
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 overflow-x-auto overflow-y-hidden">
        <div className="grid min-w-[40rem] grid-cols-[2fr_1.5fr_1.2fr_1.2fr_auto_auto] items-center gap-2 px-1 text-xs font-medium text-[color:var(--text-secondary)]">
          <span>节次名称</span>
          <span>时段</span>
          <span>开始</span>
          <span>结束</span>
          <span>教学</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid min-w-[40rem] grid-cols-[2fr_1.5fr_1.2fr_1.2fr_auto_auto] items-center gap-2"
          >
            <Input
              value={r.periodName}
              onChange={(e) => update(i, { periodName: e.target.value })}
            />
            <Select
              value={r.segment}
              onChange={(e) => update(i, { segment: e.target.value as Segment })}
            >
              {SEGMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Input
              value={r.startTime ?? ''}
              onChange={(e) => update(i, { startTime: e.target.value })}
              placeholder="08:00"
            />
            <Input
              value={r.endTime ?? ''}
              onChange={(e) => update(i, { endTime: e.target.value })}
              placeholder="08:45"
            />
            <input
              type="checkbox"
              className="mx-auto h-4 w-4 accent-brand-600"
              checked={r.isTeaching !== false}
              onChange={(e) => update(i, { isTeaching: e.target.checked })}
            />
            <Button
              variant="ghost"
              size="icon"
              className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              onClick={() => removeRow(i)}
              title="删除该节"
            >
              ✕
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="mt-1 self-start" onClick={addRow}>
          + 添加一节
        </Button>
        <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
          时段用于「主课排上午」等软约束；非教学节次（如课间操、午休）取消勾选「教学」。 当前时段：
          {labelOf(SEGMENTS, rows[0]?.segment ?? 'morning')} 起。
        </p>
      </div>
    </Modal>
  )
}
