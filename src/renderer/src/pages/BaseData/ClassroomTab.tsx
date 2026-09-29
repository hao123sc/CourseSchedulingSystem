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
import { ROOM_TYPES, labelOf } from '@shared/domain'
import type { RoomType } from '@shared/domain'
import type { Classroom, ClassroomInput } from '@shared/types/entities'

export function ClassroomTab(): React.JSX.Element {
  const [rows, setRows] = useState<Classroom[]>([])
  const [editing, setEditing] = useState<Classroom | 'new' | null>(null)

  async function reload(): Promise<void> {
    setRows(await api['classroom:list']())
  }
  useEffect(() => {
    void reload()
  }, [])

  const columns: Column<Classroom>[] = [
    {
      key: 'name',
      header: '名称',
      sortValue: (r) => r.name,
      render: (r) => <span className="font-medium">{r.name}</span>
    },
    {
      key: 'roomType',
      header: '类型',
      sortValue: (r) => r.roomType,
      render: (r) => labelOf(ROOM_TYPES, r.roomType)
    },
    { key: 'capacity', header: '座位容量', align: 'center', sortValue: (r) => r.capacity },
    {
      key: 'concurrentCapacity',
      header: '并发班数',
      align: 'center',
      sortValue: (r) => r.concurrentCapacity,
      render: (r) =>
        r.concurrentCapacity > 1 ? (
          <Badge tone="brand">{r.concurrentCapacity}</Badge>
        ) : (
          r.concurrentCapacity
        )
    },
    { key: 'building', header: '楼栋', render: (r) => r.building ?? '—' },
    {
      key: 'enabled',
      header: '状态',
      render: (r) =>
        r.enabled ? <Badge tone="green">可用</Badge> : <Badge tone="amber">停用</Badge>
    }
  ]

  async function handleImport(): Promise<void> {
    const res = await api['classroom:importExcel']()
    if (res.canceled) return
    if (res.errors.length)
      toast.info(`导入 ${res.imported} 条，跳过 ${res.skipped} 条，${res.errors.length} 条提示`)
    else toast.success(`成功导入 ${res.imported} 间教室`)
    void reload()
  }
  async function handleExport(): Promise<void> {
    const res = await api['classroom:exportExcel']()
    if (res.canceled) return
    toast.success(`已导出 ${res.count} 间教室`)
  }

  return (
    <>
      <EntityTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchText={(r) => `${r.name} ${r.building ?? ''}`}
        searchPlaceholder="搜索教室…"
        onEdit={(r) => setEditing(r)}
        onDelete={async (r) => {
          if (!confirm(`确认删除教室「${r.name}」？`)) return
          await api['classroom:delete'](r.id)
          toast.success('已删除')
          void reload()
        }}
        onDeleteMany={async (list) => {
          if (!confirm(`确认删除选中的 ${list.length} 间教室？`)) return
          await Promise.all(list.map((r) => api['classroom:delete'](r.id)))
          toast.success(`已删除 ${list.length} 间教室`)
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
              + 新增教室
            </Button>
          </>
        }
      />
      {editing && (
        <ClassroomEditModal
          classroom={editing === 'new' ? null : editing}
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

function ClassroomEditModal({
  classroom,
  onClose,
  onSaved
}: {
  classroom: Classroom | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<ClassroomInput>({
    id: classroom?.id,
    name: classroom?.name ?? '',
    roomType: classroom?.roomType ?? 'normal',
    capacity: classroom?.capacity ?? 50,
    concurrentCapacity: classroom?.concurrentCapacity ?? 1,
    building: classroom?.building ?? '',
    enabled: classroom?.enabled ?? true
  })
  const [busy, setBusy] = useState(false)

  async function save(): Promise<void> {
    if (!form.name.trim()) {
      toast.error('教室名称不能为空')
      return
    }
    setBusy(true)
    try {
      await api['classroom:upsert']({ ...form, building: form.building || null })
      toast.success('已保存教室')
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
      title={classroom ? '编辑教室' : '新增教室'}
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
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>类型</Label>
          <Select
            value={form.roomType}
            onChange={(e) => setForm({ ...form, roomType: e.target.value as RoomType })}
          >
            {ROOM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>座位容量（人数）</Label>
          <Input
            type="number"
            min={0}
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>并发班数（同时可上课班级数）</Label>
          <Input
            type="number"
            min={1}
            value={form.concurrentCapacity}
            onChange={(e) => setForm({ ...form, concurrentCapacity: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>楼栋</Label>
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
          可用
        </label>
      </div>
      <p className="mt-3 text-xs text-[color:var(--text-secondary)]">
        「座位容量」是人数上限（班级人数不得超过它）；「并发班数」是同一时段该场地能同时容纳的教学班数——
        普通教室为 1，田径场等共享场地可设 &gt;1。
      </p>
    </Modal>
  )
}
