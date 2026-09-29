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
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { SCHOOL_TYPES } from '@shared/domain'
import type { SchoolType } from '@shared/domain'
import type { Semester, SemesterInput } from '@shared/types/entities'
import { StageScheduleManager } from './StageScheduleManager'

export function SchoolSetupPage(): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">学校设置</h1>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          配置学校基本信息、学期与各学段作息
        </p>
      </div>
      <SchoolInfoCard />
      <SemesterManager />
      <StageScheduleManager />
    </div>
  )
}

function SchoolInfoCard(): React.JSX.Element {
  const { school, saveSchool } = useSchoolStore()
  const [name, setName] = useState('')
  const [schoolType, setSchoolType] = useState<SchoolType>('junior')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (school) {
      setName(school.name)
      setSchoolType(school.schoolType)
    }
  }, [school])

  async function save(): Promise<void> {
    if (!name.trim()) {
      toast.error('学校名称不能为空')
      return
    }
    setBusy(true)
    try {
      await saveSchool({ name: name.trim(), schoolType })
      toast.success('已保存学校信息')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>学校信息</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>学校名称</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如 示范中学"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>学校类型</Label>
            <Select
              value={schoolType}
              onChange={(e) => setSchoolType(e.target.value as SchoolType)}
            >
              {SCHOOL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Button className="self-start" onClick={() => void save()} disabled={busy}>
          保存
        </Button>
      </CardContent>
    </Card>
  )
}

function SemesterManager(): React.JSX.Element {
  const { semesters, currentSemester, reloadSemesters, setCurrentSemester } = useSchoolStore()
  const [editing, setEditing] = useState<Semester | 'new' | null>(null)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>学期管理</CardTitle>
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
            年级、班级、教学任务均归属于「当前学期」
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          + 新增学期
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {semesters.length === 0 && (
          <p className="py-6 text-center text-sm text-[color:var(--text-secondary)]">
            尚无学期，请先新增一个学期
          </p>
        )}
        {semesters.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-btn border border-[color:var(--border-subtle)] px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{s.name}</span>
              {s.isCurrent && <Badge tone="brand">当前学期</Badge>}
              {(s.startDate || s.endDate) && (
                <span className="text-sm text-[color:var(--text-secondary)]">
                  {s.startDate ?? '—'} ~ {s.endDate ?? '—'}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {!s.isCurrent && (
                <Button variant="outline" size="sm" onClick={() => void setCurrentSemester(s.id)}>
                  设为当前
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                编辑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={async () => {
                  if (!confirm(`确认删除学期「${s.name}」？其下年级、班级、课表将一并删除。`))
                    return
                  await api['semester:delete'](s.id)
                  toast.success('已删除学期')
                  await reloadSemesters()
                }}
              >
                删除
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      {editing && (
        <SemesterEditModal
          semester={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await reloadSemesters()
          }}
        />
      )}
      {currentSemester == null && semesters.length > 0 && (
        <CardContent>
          <p className="rounded-btn bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            当前未选定学期，请为某个学期点「设为当前」。
          </p>
        </CardContent>
      )}
    </Card>
  )
}

function SemesterEditModal({
  semester,
  onClose,
  onSaved
}: {
  semester: Semester | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<SemesterInput>({
    id: semester?.id,
    name: semester?.name ?? '',
    startDate: semester?.startDate ?? '',
    endDate: semester?.endDate ?? ''
  })
  const [busy, setBusy] = useState(false)

  async function save(): Promise<void> {
    if (!form.name.trim()) {
      toast.error('学期名称不能为空')
      return
    }
    setBusy(true)
    try {
      await api['semester:upsert']({
        ...form,
        startDate: form.startDate || null,
        endDate: form.endDate || null
      })
      toast.success('已保存学期')
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
      title={semester ? '编辑学期' : '新增学期'}
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>学期名称</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="如 2026-2027学年第一学期"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>开始日期</Label>
            <Input
              type="date"
              value={form.startDate ?? ''}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>结束日期</Label>
            <Input
              type="date"
              value={form.endDate ?? ''}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
