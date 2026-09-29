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
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { buildBatchNames } from '@shared/classNaming'
import { cn } from '@renderer/lib/utils'
import type { Grade, GradeInput, Klass, KlassInput, Stage, Teacher } from '@shared/types/entities'

export function GradeClassTab(): React.JSX.Element {
  const { currentSemester } = useSchoolStore()
  const [stages, setStages] = useState<Stage[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null)
  const [classes, setClasses] = useState<Klass[]>([])
  const [gradeModal, setGradeModal] = useState<Grade | 'new' | null>(null)
  const [classModal, setClassModal] = useState<Klass | 'new' | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [bulkHead, setBulkHead] = useState<{ rows: Klass[]; clear: () => void } | null>(null)

  const semesterId = currentSemester?.id ?? null

  async function reloadGrades(): Promise<void> {
    if (semesterId == null) {
      setGrades([])
      return
    }
    const list = await api['grade:list'](semesterId)
    setGrades(list)
    if (list.length && (selectedGradeId == null || !list.some((g) => g.id === selectedGradeId))) {
      setSelectedGradeId(list[0].id)
    }
    if (list.length === 0) setSelectedGradeId(null)
  }

  async function reloadClasses(): Promise<void> {
    if (selectedGradeId == null) {
      setClasses([])
      return
    }
    setClasses(await api['class:listByGrade'](selectedGradeId))
  }

  async function reloadTeachers(): Promise<void> {
    setTeachers(await api['teacher:list']())
  }

  useEffect(() => {
    void (async () => setStages(await api['stage:list']()))()
    void reloadTeachers()
  }, [])
  useEffect(() => {
    void reloadGrades()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesterId])
  useEffect(() => {
    void reloadClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGradeId])

  if (semesterId == null) {
    return (
      <div className="rounded-card border border-dashed border-[color:var(--border-subtle)] p-10 text-center text-sm text-[color:var(--text-secondary)]">
        请先在「学校设置 → 学期管理」中新增并设定一个当前学期。
      </div>
    )
  }

  const stageName = new Map(stages.map((s) => [s.id, s.name]))
  const teacherName = new Map(teachers.map((t) => [t.id, t.name]))
  const selectedGrade = grades.find((g) => g.id === selectedGradeId) ?? null

  const columns: Column<Klass>[] = [
    {
      key: 'name',
      header: '班级名称',
      sortValue: (r) => r.name,
      render: (r) => <span className="font-medium">{r.name}</span>
    },
    { key: 'shortName', header: '简称', render: (r) => r.shortName ?? '—' },
    { key: 'studentCount', header: '学生数', align: 'center', sortValue: (r) => r.studentCount },
    {
      key: 'headTeacherId',
      header: '班主任',
      sortValue: (r) => (r.headTeacherId ? (teacherName.get(r.headTeacherId) ?? '') : ''),
      render: (r) =>
        r.headTeacherId ? (
          (teacherName.get(r.headTeacherId) ?? `#${r.headTeacherId}`)
        ) : (
          <span className="text-[color:var(--text-secondary)]">—</span>
        )
    },
    {
      key: 'isVirtual',
      header: '类型',
      render: (r) =>
        r.isVirtual ? <Badge tone="brand">走班</Badge> : <Badge tone="slate">行政班</Badge>
    }
  ]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* 年级列 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[color:var(--text-secondary)]">年级</span>
          <Button size="sm" variant="outline" onClick={() => setGradeModal('new')}>
            + 年级
          </Button>
        </div>
        {grades.length === 0 && (
          <p className="rounded-btn border border-dashed border-[color:var(--border-subtle)] p-4 text-center text-sm text-[color:var(--text-secondary)]">
            暂无年级
          </p>
        )}
        {grades.map((g) => (
          <button
            key={g.id}
            onClick={() => setSelectedGradeId(g.id)}
            className={cn(
              'group flex items-center justify-between rounded-btn border px-3 py-2 text-left text-sm transition-colors',
              g.id === selectedGradeId
                ? 'border-brand-600 bg-brand-50 dark:bg-brand-600/20'
                : 'border-[color:var(--border-subtle)] hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
          >
            <span>
              <span className="font-medium">{g.name}</span>
              <span className="ml-2 text-xs text-[color:var(--text-secondary)]">
                {stageName.get(g.stageId) ?? ''}
              </span>
            </span>
            <span
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                setGradeModal(g)
              }}
            >
              ✎
            </span>
          </button>
        ))}
      </div>

      {/* 班级表 */}
      <div className="flex flex-col gap-3">
        {selectedGrade ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{selectedGrade.name}</h3>
                <Badge tone="slate">{classes.length} 个班</Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={async () => {
                  if (!confirm(`确认删除年级「${selectedGrade.name}」及其全部班级？`)) return
                  await api['grade:delete'](selectedGrade.id)
                  toast.success('已删除年级')
                  await reloadGrades()
                }}
              >
                删除该年级
              </Button>
            </div>
            <EntityTable
              columns={columns}
              rows={classes}
              rowKey={(r) => r.id}
              searchText={(r) => `${r.name} ${r.shortName ?? ''}`}
              searchPlaceholder="搜索班级…"
              onEdit={(r) => setClassModal(r)}
              onDelete={async (r) => {
                if (!confirm(`确认删除班级「${r.name}」？`)) return
                await api['class:delete'](r.id)
                toast.success('已删除')
                void reloadClasses()
              }}
              onDeleteMany={async (list) => {
                if (!confirm(`确认删除选中的 ${list.length} 个班级？`)) return
                await Promise.all(list.map((r) => api['class:delete'](r.id)))
                toast.success(`已删除 ${list.length} 个班级`)
                void reloadClasses()
              }}
              bulkActions={(rows, clear) => (
                <Button variant="outline" size="sm" onClick={() => setBulkHead({ rows, clear })}>
                  指定班主任（{rows.length}）
                </Button>
              )}
              toolbar={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleImportClasses(semesterId, reloadClasses)}
                  >
                    导入 Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleExportClasses(semesterId)}
                  >
                    导出 Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setBatchOpen(true)}>
                    批量生成
                  </Button>
                  <Button size="sm" onClick={() => setClassModal('new')}>
                    + 新增班级
                  </Button>
                </>
              }
            />
          </>
        ) : (
          <div className="rounded-card border border-dashed border-[color:var(--border-subtle)] p-10 text-center text-sm text-[color:var(--text-secondary)]">
            请先在左侧新增一个年级
          </div>
        )}
      </div>

      {gradeModal && (
        <GradeEditModal
          grade={gradeModal === 'new' ? null : gradeModal}
          semesterId={semesterId}
          stages={stages}
          onClose={() => setGradeModal(null)}
          onSaved={async () => {
            setGradeModal(null)
            await reloadGrades()
          }}
        />
      )}
      {classModal && selectedGrade && (
        <ClassEditModal
          klass={classModal === 'new' ? null : classModal}
          gradeId={selectedGrade.id}
          teachers={teachers}
          onClose={() => setClassModal(null)}
          onSaved={() => {
            setClassModal(null)
            void reloadClasses()
          }}
        />
      )}
      {bulkHead && (
        <BulkHeadTeacherModal
          rows={bulkHead.rows}
          teachers={teachers}
          onClose={() => setBulkHead(null)}
          onSaved={() => {
            bulkHead.clear()
            setBulkHead(null)
            void reloadClasses()
          }}
        />
      )}
      {batchOpen && selectedGrade && (
        <BatchCreateModal
          grade={selectedGrade}
          existingCount={classes.length}
          onClose={() => setBatchOpen(false)}
          onSaved={() => {
            setBatchOpen(false)
            void reloadClasses()
          }}
        />
      )}
    </div>
  )
}

async function handleExportClasses(semesterId: number): Promise<void> {
  const res = await api['class:exportExcel'](semesterId)
  if (res.canceled) return
  toast.success(`已导出 ${res.count} 个班级`)
}
async function handleImportClasses(semesterId: number, reload: () => Promise<void>): Promise<void> {
  const res = await api['class:importExcel'](semesterId)
  if (res.canceled) return
  if (res.errors.length)
    toast.info(`导入 ${res.imported} 条，跳过 ${res.skipped} 条，${res.errors.length} 条提示`)
  else toast.success(`成功导入 ${res.imported} 个班级`)
  await reload()
}

function GradeEditModal({
  grade,
  semesterId,
  stages,
  onClose,
  onSaved
}: {
  grade: Grade | null
  semesterId: number
  stages: Stage[]
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<GradeInput>({
    id: grade?.id,
    semesterId,
    stageId: grade?.stageId ?? stages.find((s) => s.enabled)?.id ?? stages[0]?.id ?? 0,
    name: grade?.name ?? '',
    enrollYear: grade?.enrollYear ?? null
  })
  const [busy, setBusy] = useState(false)

  async function save(): Promise<void> {
    if (!form.name.trim()) {
      toast.error('年级名称不能为空')
      return
    }
    if (!form.stageId) {
      toast.error('请选择学段（如无学段请先在学校设置中新增）')
      return
    }
    setBusy(true)
    try {
      await api['grade:upsert'](form)
      toast.success('已保存年级')
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
      title={grade ? '编辑年级' : '新增年级'}
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
          <Label>年级名称</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="如 初一"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>所属学段</Label>
          <Select
            value={form.stageId}
            onChange={(e) => setForm({ ...form, stageId: Number(e.target.value) })}
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>入学年份（选填）</Label>
          <Input
            type="number"
            value={form.enrollYear ?? ''}
            onChange={(e) =>
              setForm({ ...form, enrollYear: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="如 2026"
          />
        </div>
      </div>
    </Modal>
  )
}

function ClassEditModal({
  klass,
  gradeId,
  teachers,
  onClose,
  onSaved
}: {
  klass: Klass | null
  gradeId: number
  teachers: Teacher[]
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<KlassInput>({
    id: klass?.id,
    gradeId,
    name: klass?.name ?? '',
    shortName: klass?.shortName ?? '',
    studentCount: klass?.studentCount ?? 45,
    isVirtual: klass?.isVirtual ?? false,
    headTeacherId: klass?.headTeacherId ?? null,
    // 保留固定教室，避免编辑时被清空（固定教室由种子/后续里程碑维护）
    homeRoomId: klass?.homeRoomId ?? null
  })
  const [busy, setBusy] = useState(false)

  async function save(): Promise<void> {
    if (!form.name.trim()) {
      toast.error('班级名称不能为空')
      return
    }
    setBusy(true)
    try {
      await api['class:upsert']({ ...form, shortName: form.shortName || null })
      toast.success('已保存班级')
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
      title={klass ? '编辑班级' : '新增班级'}
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
          <Label>班级名称</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>简称</Label>
          <Input
            value={form.shortName ?? ''}
            onChange={(e) => setForm({ ...form, shortName: e.target.value })}
            placeholder="如 1班"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>学生数</Label>
          <Input
            type="number"
            min={0}
            value={form.studentCount}
            onChange={(e) => setForm({ ...form, studentCount: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>班主任</Label>
          <select
            className="h-9 rounded-input border border-[color:var(--border-subtle)] bg-[color:var(--surface)] px-2 text-sm"
            value={form.headTeacherId ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                headTeacherId: e.target.value === '' ? null : Number(e.target.value)
              })
            }
          >
            <option value="">未指定</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.staffNo ? `（${t.staffNo}）` : ''}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={form.isVirtual ?? false}
            onChange={(e) => setForm({ ...form, isVirtual: e.target.checked })}
          />
          走班虚拟教学班
        </label>
      </div>
    </Modal>
  )
}

function BulkHeadTeacherModal({
  rows,
  teachers,
  onClose,
  onSaved
}: {
  rows: Klass[]
  teachers: Teacher[]
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [teacherId, setTeacherId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(): Promise<void> {
    setBusy(true)
    try {
      // 逐个 upsert，保留各班原有字段（尤其 homeRoomId），仅更新班主任
      await Promise.all(
        rows.map((r) =>
          api['class:upsert']({
            id: r.id,
            gradeId: r.gradeId,
            name: r.name,
            shortName: r.shortName ?? null,
            studentCount: r.studentCount,
            isVirtual: r.isVirtual,
            homeRoomId: r.homeRoomId ?? null,
            headTeacherId: teacherId
          })
        )
      )
      toast.success(
        teacherId == null
          ? `已清除 ${rows.length} 个班级的班主任`
          : `已为 ${rows.length} 个班级指定班主任`
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
      title="批量指定班主任"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            应用到 {rows.length} 个班级
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[color:var(--text-secondary)]">
          将为选中的{' '}
          <span className="font-medium text-[color:var(--text-primary)]">{rows.length}</span>{' '}
          个班级统一设置班主任：
          <span className="ml-1">{rows.map((r) => r.name).join('、')}</span>
        </p>
        <div className="flex flex-col gap-1.5">
          <Label>班主任</Label>
          <select
            className="h-9 rounded-input border border-[color:var(--border-subtle)] bg-[color:var(--surface)] px-2 text-sm"
            value={teacherId ?? ''}
            onChange={(e) => setTeacherId(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">未指定（清除班主任）</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.staffNo ? `（${t.staffNo}）` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  )
}

function BatchCreateModal({
  grade,
  existingCount,
  onClose,
  onSaved
}: {
  grade: Grade
  existingCount: number
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const [count, setCount] = useState(20)
  const [pattern, setPattern] = useState('{name}({n})班')
  const [studentCount, setStudentCount] = useState(45)
  const [busy, setBusy] = useState(false)

  const startIndex = existingCount + 1
  const preview = buildBatchNames(pattern, Math.min(count, 3), grade.name, startIndex)

  async function run(): Promise<void> {
    if (count < 1) {
      toast.error('生成数量至少为 1')
      return
    }
    setBusy(true)
    try {
      const created = await api['class:batchCreate']({
        gradeId: grade.id,
        count,
        namePattern: pattern,
        studentCount
      })
      toast.success(`已为「${grade.name}」生成 ${created.length} 个班`)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`批量生成班级 · ${grade.name}`}
      description={`将从第 ${startIndex} 号开始追加，已有 ${existingCount} 个班。`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void run()} disabled={busy}>
            生成
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>生成数量</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>每班学生数</Label>
          <Input
            type="number"
            min={0}
            value={studentCount}
            onChange={(e) => setStudentCount(Number(e.target.value))}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>命名模板</Label>
          <Input value={pattern} onChange={(e) => setPattern(e.target.value)} />
          <p className="text-xs text-[color:var(--text-secondary)]">
            占位符：<code>{'{name}'}</code> 年级名、<code>{'{n}'}</code> 序号、
            <code>{'{nn}'}</code> 两位补零序号
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-btn bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
        预览：{preview.join('、')}
        {count > 3 && ` … 共 ${count} 个`}
      </div>
    </Modal>
  )
}
