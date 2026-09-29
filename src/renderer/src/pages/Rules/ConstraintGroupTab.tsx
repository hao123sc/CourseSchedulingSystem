import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@renderer/lib/api'
import { useMetaStore } from '@renderer/stores/metaStore'
import { toast } from '@renderer/stores/toastStore'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { Modal } from '@renderer/components/ui/modal'
import { cn } from '@renderer/lib/utils'
import {
  GROUP_HARDNESS,
  GROUP_TYPES,
  GROUP_TYPE_MEMBER_TYPES,
  labelOf,
  type GroupHardness,
  type GroupMemberType,
  type GroupType
} from '@shared/domain'
import type { ConstraintGroup, GroupMember, TeachingTask } from '@shared/types/entities'

interface Props {
  semesterId: number
}

/** 约束组 CRUD：教师互斥 / 学科互斥 / 合班拼合 / 跟随 / 同时上课 */
export function ConstraintGroupTab({ semesterId }: Props): React.JSX.Element {
  const [groups, setGroups] = useState<ConstraintGroup[]>([])
  const [editing, setEditing] = useState<ConstraintGroup | 'new' | null>(null)
  const [tasks, setTasks] = useState<TeachingTask[]>([])

  const load = useCallback(async () => {
    const [g, t] = await Promise.all([
      api['constraintGroup:list'](semesterId),
      api['task:list'](semesterId)
    ])
    setGroups(g)
    setTasks(t)
  }, [semesterId])

  useEffect(() => {
    void load()
  }, [load])

  const nameOf = useMemberNamer(tasks)

  const remove = async (id: number): Promise<void> => {
    if (!window.confirm('确定删除该约束组？')) return
    await api['constraintGroup:delete'](id)
    await load()
    toast.success('已删除约束组')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-[color:var(--text-secondary)]">
          硬约束组参与 H8 / H9 判定；软约束组只在评分里惩罚，排不开时可让步
        </p>
        <Button className="ml-auto" onClick={() => setEditing('new')}>
          新建约束组
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {groups.length === 0 && (
          <div className="col-span-full rounded-card border border-dashed border-[color:var(--border-subtle)] p-10 text-center text-sm text-[color:var(--text-secondary)]">
            还没有约束组。典型用法：两位跨校兼课教师互斥、体育与音乐不同时占用风雨操场、
            两个班的信息技术拼班合上。
          </div>
        )}
        {groups.map((g) => (
          <div
            key={g.id}
            className="flex flex-col gap-2 rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{g.name}</span>
              <Badge tone="brand">{labelOf(GROUP_TYPES, g.groupType)}</Badge>
              <Badge tone={g.hardness === 'hard' ? 'red' : 'amber'}>
                {labelOf(GROUP_HARDNESS, g.hardness)}
              </Badge>
              {g.maxConcurrent != null && <Badge tone="slate">并发上限 {g.maxConcurrent}</Badge>}
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(g)}>
                  编辑
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void remove(g.id)}>
                  删除
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {g.members.length === 0 && (
                <span className="text-xs text-[color:var(--text-secondary)]">（无成员）</span>
              )}
              {g.members.map((m) => (
                <span
                  key={`${m.memberType}-${m.memberId}`}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800"
                >
                  {nameOf(m)}
                </span>
              ))}
            </div>
            {g.scopeNote && (
              <p className="text-xs text-[color:var(--text-secondary)]">备注：{g.scopeNote}</p>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <GroupEditor
          semesterId={semesterId}
          group={editing === 'new' ? null : editing}
          tasks={tasks}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

/** 成员 id → 可读名称 */
function useMemberNamer(tasks: TeachingTask[]): (m: GroupMember) => string {
  const meta = useMetaStore()
  return useMemo(() => {
    const teacher = new Map(meta.teachers.map((t) => [t.id, t.name]))
    const subject = new Map(meta.subjects.map((s) => [s.id, s.name]))
    const klass = new Map(meta.classes.map((c) => [c.id, c.name]))
    const task = new Map(
      tasks.map((t) => [
        t.id,
        `${klass.get(t.classId) ?? '班级'}·${subject.get(t.subjectId) ?? '学科'}`
      ])
    )
    return (m: GroupMember): string => {
      switch (m.memberType) {
        case 'teacher':
          return teacher.get(m.memberId) ?? `教师#${m.memberId}`
        case 'subject':
          return subject.get(m.memberId) ?? `学科#${m.memberId}`
        case 'class':
          return klass.get(m.memberId) ?? `班级#${m.memberId}`
        case 'task':
          return task.get(m.memberId) ?? `任务#${m.memberId}`
        default:
          return String(m.memberId)
      }
    }
  }, [meta.teachers, meta.subjects, meta.classes, tasks])
}

function GroupEditor({
  semesterId,
  group,
  tasks,
  onClose,
  onSaved
}: {
  semesterId: number
  group: ConstraintGroup | null
  tasks: TeachingTask[]
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const meta = useMetaStore()
  const [groupType, setGroupType] = useState<GroupType>(group?.groupType ?? 'teacher_mutex')
  const [name, setName] = useState(group?.name ?? '')
  const [hardness, setHardness] = useState<GroupHardness>(group?.hardness ?? 'hard')
  const [maxConcurrent, setMaxConcurrent] = useState<string>(
    group?.maxConcurrent != null ? String(group.maxConcurrent) : ''
  )
  const [scopeNote, setScopeNote] = useState(group?.scopeNote ?? '')
  const [members, setMembers] = useState<GroupMember[]>(group?.members ?? [])
  const [memberType, setMemberType] = useState<GroupMemberType>(
    GROUP_TYPE_MEMBER_TYPES[group?.groupType ?? 'teacher_mutex'][0]
  )
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const allowedTypes = GROUP_TYPE_MEMBER_TYPES[groupType]
  useEffect(() => {
    if (!allowedTypes.includes(memberType)) setMemberType(allowedTypes[0])
  }, [allowedTypes, memberType])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    const subjectName = new Map(meta.subjects.map((s) => [s.id, s.name]))
    const className = new Map(meta.classes.map((c) => [c.id, c.name]))
    let list: { id: number; name: string }[] = []
    switch (memberType) {
      case 'teacher':
        list = meta.teachers.filter((t) => t.enabled).map((t) => ({ id: t.id, name: t.name }))
        break
      case 'subject':
        list = meta.subjects.map((s) => ({ id: s.id, name: s.name }))
        break
      case 'class':
        list = meta.classes.map((c) => ({ id: c.id, name: c.name }))
        break
      case 'task':
        list = tasks.map((t) => ({
          id: t.id,
          name: `${className.get(t.classId) ?? ''}·${subjectName.get(t.subjectId) ?? ''}`
        }))
        break
    }
    return list.filter((x) => (q === '' ? true : x.name.toLowerCase().includes(q))).slice(0, 200)
  }, [memberType, meta, tasks, query])

  const toggle = (id: number): void =>
    setMembers((prev) =>
      prev.some((m) => m.memberType === memberType && m.memberId === id)
        ? prev.filter((m) => !(m.memberType === memberType && m.memberId === id))
        : [...prev, { memberType, memberId: id }]
    )

  const save = async (): Promise<void> => {
    if (name.trim() === '') {
      toast.error('请填写约束组名称')
      return
    }
    setBusy(true)
    try {
      await api['constraintGroup:upsert']({
        id: group?.id,
        semesterId,
        groupType,
        name: name.trim(),
        hardness,
        maxConcurrent: maxConcurrent === '' ? null : Number(maxConcurrent),
        scopeNote: scopeNote.trim() || null,
        members
      })
      toast.success(group ? '已更新约束组' : '已创建约束组')
      onSaved()
    } catch (err) {
      toast.error(`保存失败：${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={group ? '编辑约束组' : '新建约束组'}
      description={GROUP_TYPES.find((t) => t.value === groupType)?.hint}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={save} disabled={busy}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--text-secondary)]">名称</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：体育组场地互斥"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--text-secondary)]">类型</span>
            <Select
              value={groupType}
              onChange={(e) => {
                setGroupType(e.target.value as GroupType)
                setMembers([])
              }}
            >
              {GROUP_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--text-secondary)]">强度</span>
            <Select value={hardness} onChange={(e) => setHardness(e.target.value as GroupHardness)}>
              {GROUP_HARDNESS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--text-secondary)]">
              并发上限（软互斥时可留空）
            </span>
            <Input
              type="number"
              min={1}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(e.target.value)}
              placeholder="不限"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--text-secondary)]">
            备注（same_day 等语义）
          </span>
          <Input
            value={scopeNote}
            onChange={(e) => setScopeNote(e.target.value)}
            placeholder="如：same_day / same_slot"
          />
        </label>

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-xs text-[color:var(--text-secondary)]">
              成员（已选 {members.length}）
            </span>
            {allowedTypes.length > 1 && (
              <Select
                value={memberType}
                onChange={(e) => setMemberType(e.target.value as GroupMemberType)}
                className="h-7 w-24 text-xs"
              >
                {allowedTypes.map((t) => (
                  <option key={t} value={t}>
                    {t === 'teacher'
                      ? '教师'
                      : t === 'subject'
                        ? '学科'
                        : t === 'class'
                          ? '班级'
                          : '教学任务'}
                  </option>
                ))}
              </Select>
            )}
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索…"
              className="ml-auto h-7 w-40 text-xs"
            />
          </div>
          <div className="flex max-h-56 flex-wrap gap-1 overflow-y-auto rounded-card border border-[color:var(--border-subtle)] p-2">
            {candidates.length === 0 && (
              <span className="px-1 py-4 text-xs text-[color:var(--text-secondary)]">
                没有可选成员
              </span>
            )}
            {candidates.map((c) => {
              const on = members.some((m) => m.memberType === memberType && m.memberId === c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs transition-colors',
                    on
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-[color:var(--text-secondary)] hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
                  )}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}
