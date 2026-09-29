import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Modal } from '@renderer/components/ui/modal'
import { Badge } from '@renderer/components/ui/badge'
import { EntityTable, type Column } from '@renderer/components/common/EntityTable'
import { toast } from '@renderer/stores/toastStore'
import { SUBJECT_CATEGORIES, WEEK_SPREADS, labelOf } from '@shared/domain'
import type { SubjectCategory, WeekSpread } from '@shared/domain'
import type { Subject, SubjectInput } from '@shared/types/entities'

export function SubjectTab(): React.JSX.Element {
  const [rows, setRows] = useState<Subject[]>([])
  const [editing, setEditing] = useState<Subject | 'new' | null>(null)

  async function reload(): Promise<void> {
    setRows(await api['subject:list']())
  }
  useEffect(() => {
    void reload()
  }, [])

  const columns: Column<Subject>[] = [
    {
      key: 'name',
      header: '学科',
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 rounded"
            style={{ backgroundColor: r.color }}
            aria-hidden
          />
          <span className="font-medium">{r.name}</span>
          <Badge tone="slate">{r.shortName}</Badge>
        </span>
      )
    },
    {
      key: 'category',
      header: '类别',
      sortValue: (r) => r.category,
      render: (r) => labelOf(SUBJECT_CATEGORIES, r.category)
    },
    { key: 'importance', header: '重要性', align: 'center', sortValue: (r) => r.importance },
    {
      key: 'needSpecialRoom',
      header: '专用教室',
      align: 'center',
      render: (r) => (r.needSpecialRoom ? '是' : '—')
    },
    { key: 'dailyMax', header: '每日上限', align: 'center', sortValue: (r) => r.dailyMax },
    {
      key: 'weekSpread',
      header: '分布',
      render: (r) => labelOf(WEEK_SPREADS, r.weekSpread)
    }
  ]

  return (
    <>
      <EntityTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchText={(r) => `${r.name} ${r.shortName}`}
        searchPlaceholder="搜索学科…"
        onEdit={(r) => setEditing(r)}
        onDelete={async (r) => {
          if (!confirm(`确认删除学科「${r.name}」？`)) return
          await api['subject:delete'](r.id)
          toast.success('已删除')
          void reload()
        }}
        onDeleteMany={async (list) => {
          if (!confirm(`确认删除选中的 ${list.length} 个学科？`)) return
          await Promise.all(list.map((r) => api['subject:delete'](r.id)))
          toast.success(`已删除 ${list.length} 个学科`)
          void reload()
        }}
        toolbar={
          <Button size="sm" onClick={() => setEditing('new')}>
            + 新增学科
          </Button>
        }
      />
      {editing && (
        <SubjectEditModal
          subject={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void reload()
          }}
        />
      )}
    </>
  )
}

function SubjectEditModal({
  subject,
  onClose,
  onSaved
}: {
  subject: Subject | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<SubjectInput>({
    id: subject?.id,
    name: subject?.name ?? '',
    shortName: subject?.shortName ?? '',
    color: subject?.color ?? '#6366F1',
    category: subject?.category ?? 'main',
    importance: subject?.importance ?? 3,
    needSpecialRoom: subject?.needSpecialRoom ?? false,
    dailyMax: subject?.dailyMax ?? 1,
    weekSpread: subject?.weekSpread ?? 'spread'
  })
  const [busy, setBusy] = useState(false)

  async function save(): Promise<void> {
    if (!form.name.trim() || !form.shortName.trim()) {
      toast.error('学科名称与简称不能为空')
      return
    }
    setBusy(true)
    try {
      await api['subject:upsert'](form)
      toast.success('已保存学科')
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
      title={subject ? '编辑学科' : '新增学科'}
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
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>名称</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>简称（课表显示 1-2 字）</Label>
          <Input
            value={form.shortName}
            maxLength={4}
            onChange={(e) => setForm({ ...form, shortName: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>课表配色</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded-input border border-[color:var(--border-subtle)] bg-transparent"
            />
            <Input
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>类别</Label>
          <Select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as SubjectCategory })}
          >
            {SUBJECT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>重要性（1-5）</Label>
          <Select
            value={form.importance}
            onChange={(e) => setForm({ ...form, importance: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>每日上限（同班）</Label>
          <Input
            type="number"
            min={1}
            value={form.dailyMax}
            onChange={(e) => setForm({ ...form, dailyMax: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>周内分布</Label>
          <Select
            value={form.weekSpread}
            onChange={(e) => setForm({ ...form, weekSpread: e.target.value as WeekSpread })}
          >
            {WEEK_SPREADS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={form.needSpecialRoom ?? false}
            onChange={(e) => setForm({ ...form, needSpecialRoom: e.target.checked })}
          />
          需要专用教室
        </label>
      </div>
    </Modal>
  )
}
