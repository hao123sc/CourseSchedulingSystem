import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Modal } from '@renderer/components/ui/modal'
import { Badge } from '@renderer/components/ui/badge'
import { EntityTable, type Column } from '@renderer/components/common/EntityTable'
import { toast } from '@renderer/stores/toastStore'
import type { Subject, Teacher, TeacherInput } from '@shared/types/entities'
import type { ExcelImportResult } from '@shared/types/entities'

export function TeacherTab(): React.JSX.Element {
  const [rows, setRows] = useState<Teacher[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [editing, setEditing] = useState<Teacher | 'new' | null>(null)

  async function reload(): Promise<void> {
    const [t, s] = await Promise.all([api['teacher:list'](), api['subject:list']()])
    setRows(t)
    setSubjects(s)
  }
  useEffect(() => {
    void reload()
  }, [])

  const subjName = new Map(subjects.map((s) => [s.id, s]))

  const columns: Column<Teacher>[] = [
    {
      key: 'name',
      header: '姓名',
      sortValue: (r) => r.name,
      render: (r) => <span className="font-medium">{r.name}</span>
    },
    {
      key: 'staffNo',
      header: '工号',
      sortValue: (r) => r.staffNo ?? '',
      render: (r) => r.staffNo ?? '—'
    },
    {
      key: 'subjectIds',
      header: '任教学科',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.subjectIds.length === 0 && (
            <span className="text-[color:var(--text-secondary)]">—</span>
          )}
          {r.subjectIds.map((id) => {
            const s = subjName.get(id)
            return s ? (
              <span
                key={id}
                className="rounded px-1.5 py-0.5 text-xs"
                style={{ backgroundColor: `${s.color}22`, color: s.color }}
              >
                {s.name}
              </span>
            ) : null
          })}
        </div>
      )
    },
    {
      key: 'maxWeeklyPeriods',
      header: '周最大课时',
      align: 'center',
      sortValue: (r) => r.maxWeeklyPeriods
    },
    { key: 'building', header: '办公楼栋', render: (r) => r.building ?? '—' },
    {
      key: 'enabled',
      header: '状态',
      render: (r) =>
        r.enabled ? <Badge tone="green">在职</Badge> : <Badge tone="amber">停用</Badge>
    }
  ]

  async function handleImport(): Promise<void> {
    const res: ExcelImportResult = await api['teacher:importExcel']()
    if (res.canceled) return
    if (res.errors.length)
      toast.info(`导入 ${res.imported} 条，跳过 ${res.skipped} 条，${res.errors.length} 条提示`)
    else toast.success(`成功导入 ${res.imported} 名教师`)
    void reload()
  }
  async function handleExport(): Promise<void> {
    const res = await api['teacher:exportExcel']()
    if (res.canceled) return
    toast.success(`已导出 ${res.count} 名教师`)
  }

  return (
    <>
      <EntityTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchText={(r) => `${r.name} ${r.staffNo ?? ''} ${r.building ?? ''}`}
        searchPlaceholder="搜索教师…"
        onEdit={(r) => setEditing(r)}
        onDelete={async (r) => {
          if (!confirm(`确认删除教师「${r.name}」？`)) return
          await api['teacher:delete'](r.id)
          toast.success('已删除')
          void reload()
        }}
        onDeleteMany={async (list) => {
          if (!confirm(`确认删除选中的 ${list.length} 名教师？`)) return
          await Promise.all(list.map((r) => api['teacher:delete'](r.id)))
          toast.success(`已删除 ${list.length} 名教师`)
          void reload()
        }}
        toolbar={
          <>
            <Button variant="outline" size="sm" onClick={() => void handleImport()}>
              导入 Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleExport()}>
              导出 Excel
            </Button>
            <Button size="sm" onClick={() => setEditing('new')}>
              + 新增教师
            </Button>
          </>
        }
      />
      {editing && (
        <TeacherEditModal
          teacher={editing === 'new' ? null : editing}
          subjects={subjects}
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

function TeacherEditModal({
  teacher,
  subjects,
  onClose,
  onSaved
}: {
  teacher: Teacher | null
  subjects: Subject[]
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<TeacherInput>({
    id: teacher?.id,
    name: teacher?.name ?? '',
    staffNo: teacher?.staffNo ?? '',
    phone: teacher?.phone ?? '',
    maxWeeklyPeriods: teacher?.maxWeeklyPeriods ?? 18,
    building: teacher?.building ?? '',
    enabled: teacher?.enabled ?? true,
    subjectIds: teacher?.subjectIds ?? []
  })
  const [busy, setBusy] = useState(false)

  function toggleSubject(id: number): void {
    setForm((f) => {
      const set = new Set(f.subjectIds ?? [])
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...f, subjectIds: [...set] }
    })
  }

  async function save(): Promise<void> {
    if (!form.name.trim()) {
      toast.error('教师姓名不能为空')
      return
    }
    setBusy(true)
    try {
      await api['teacher:upsert']({
        ...form,
        staffNo: form.staffNo || null,
        phone: form.phone || null,
        building: form.building || null
      })
      toast.success('已保存教师')
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
      title={teacher ? '编辑教师' : '新增教师'}
      className="max-w-2xl"
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
          <Label>姓名</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>工号</Label>
          <Input
            value={form.staffNo ?? ''}
            onChange={(e) => setForm({ ...form, staffNo: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>电话</Label>
          <Input
            value={form.phone ?? ''}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>周最大课时</Label>
          <Input
            type="number"
            min={0}
            value={form.maxWeeklyPeriods}
            onChange={(e) => setForm({ ...form, maxWeeklyPeriods: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>办公楼栋</Label>
          <Input
            value={form.building ?? ''}
            onChange={(e) => setForm({ ...form, building: e.target.value })}
          />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={form.enabled ?? true}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          在职启用
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Label>任教学科（可多选）</Label>
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => {
            const active = (form.subjectIds ?? []).includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSubject(s.id)}
                className={
                  'rounded-full border px-3 py-1 text-sm transition-colors ' +
                  (active
                    ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                    : 'border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-800')
                }
              >
                {s.name}
              </button>
            )
          })}
          {subjects.length === 0 && (
            <span className="text-sm text-[color:var(--text-secondary)]">
              请先在「学科」页添加学科
            </span>
          )}
        </div>
      </div>
    </Modal>
  )
}
