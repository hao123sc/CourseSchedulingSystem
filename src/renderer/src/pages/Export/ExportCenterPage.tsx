import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@renderer/lib/api'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { useMetaStore } from '@renderer/stores/metaStore'
import { toast } from '@renderer/stores/toastStore'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import type { Lesson, ScheduleVersion } from '@shared/types/entities'
import type { TimetableExportScope } from '@shared/types/ipc'

export function ExportCenterPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { currentSemester, loaded, load } = useSchoolStore()
  const meta = useMetaStore()
  const semesterId = currentSemester?.id ?? null

  const [versions, setVersions] = useState<ScheduleVersion[]>([])
  const [versionId, setVersionId] = useState<number | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(false)
  const [exportingCard, setExportingCard] = useState<string | null>(null)

  // 实体导出选择状态
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null)
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null)

  const [classExportMode, setClassExportMode] = useState<'batch' | 'single'>('batch')
  const [teacherExportMode, setTeacherExportMode] = useState<'batch' | 'single'>('batch')
  const [roomExportMode, setRoomExportMode] = useState<'batch' | 'single'>('batch')

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    if (semesterId != null) void meta.load(semesterId)
  }, [semesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 读取排课版本
  useEffect(() => {
    if (semesterId == null) return
    let alive = true
    api['schedule:listVersions'](semesterId)
      .then((rows) => {
        if (!alive) return
        const sorted = [...rows].sort((a, b) => b.id - a.id)
        setVersions(sorted)
        const paramVer = searchParams.get('versionId')
        if (paramVer && !isNaN(Number(paramVer))) {
          setVersionId(Number(paramVer))
        } else if (sorted.length > 0 && versionId == null) {
          setVersionId(sorted[0].id)
        }
      })
      .catch((e) => toast.error(`读取版本列表失败: ${String(e)}`))
    return () => {
      alive = false
    }
  }, [semesterId, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // 读取课节数据以供预览统计
  useEffect(() => {
    if (versionId == null) {
      setLessons([])
      return
    }
    setLoading(true)
    let alive = true
    api['timetable:versionLessons'](versionId)
      .then((rows) => alive && setLessons(rows))
      .catch((e) => {
        if (alive) {
          toast.error(`读取课表数据失败: ${String(e)}`)
          setLessons([])
        }
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [versionId])

  // 学段 / 实体初始化
  useEffect(() => {
    if (meta.stages.length > 0 && selectedStageId == null) {
      setSelectedStageId(meta.stages[0].id)
    }
    if (meta.classes.length > 0 && selectedClassId == null) {
      setSelectedClassId(meta.classes[0].id)
    }
    if (meta.teachers.length > 0 && selectedTeacherId == null) {
      const activeTeacher = meta.teachers.find((t) => t.enabled)
      setSelectedTeacherId(activeTeacher?.id ?? meta.teachers[0].id)
    }
    if (meta.classrooms.length > 0 && selectedRoomId == null) {
      const activeRoom = meta.classrooms.find((r) => r.enabled)
      setSelectedRoomId(activeRoom?.id ?? meta.classrooms[0].id)
    }
  }, [meta.stages, meta.classes, meta.teachers, meta.classrooms, selectedStageId, selectedClassId, selectedTeacherId, selectedRoomId])

  const activeVersion = useMemo(
    () => versions.find((v) => v.id === versionId) ?? null,
    [versions, versionId]
  )

  const stageClasses = useMemo(() => {
    if (selectedStageId == null) return meta.classes
    const stageGradeIds = new Set(meta.grades.filter((g) => g.stageId === selectedStageId).map((g) => g.id))
    return meta.classes.filter((c) => stageGradeIds.has(c.gradeId))
  }, [meta.classes, meta.grades, selectedStageId])

  const handleExport = async (
    cardKey: string,
    params: {
      view: 'class' | 'teacher' | 'room' | 'overview'
      scope: TimetableExportScope
      targetId?: number | null
      stageId?: number | null
    }
  ): Promise<void> => {
    if (semesterId == null || versionId == null) {
      toast.error('请选择有效的学期与排课版本')
      return
    }

    setExportingCard(cardKey)
    try {
      const res = await api['timetable:exportExcel']({
        semesterId,
        versionId,
        stageId: params.stageId ?? selectedStageId,
        view: params.view,
        targetId: params.targetId ?? null,
        scope: params.scope
      })

      if (res.canceled) {
        toast.info('已取消导出')
      } else {
        toast.success(`导出成功！已保存至 ${res.filePath}（包含 ${res.count} 张工作表）`)
      }
    } catch (err) {
      toast.error(`导出失败：${String(err)}`)
    } finally {
      setExportingCard(null)
    }
  }

  if (versions.length === 0 && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-3xl text-brand-600 dark:bg-brand-900/30">
          📤
        </div>
        <h2 className="text-xl font-bold">暂无可导出的课表数据</h2>
        <p className="mt-2 max-w-md text-sm text-[color:var(--text-secondary)]">
          当前学期尚未进行排课。请前往「开始排课」生成课表后，即可批量导出全套 Excel 课表与总表。
        </p>
        <Button className="mt-6" onClick={() => navigate('/scheduling')}>
          前往开始排课 →
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[color:var(--bg-page)] text-[color:var(--text-primary)]">
      {/* ── 顶部工具栏 ── */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">
            导出版本:
          </span>
          <div className="w-56">
            <Select
              value={versionId ?? ''}
              onChange={(e) => setVersionId(Number(e.target.value))}
              disabled={loading || exportingCard !== null}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.isPublished ? ' (已发布)' : ''}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {meta.stages.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">
              学段:
            </span>
            <div className="w-36">
              <Select
                value={selectedStageId ?? ''}
                onChange={(e) => setSelectedStageId(Number(e.target.value))}
              >
                {meta.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/report?versionId=${versionId ?? ''}`)}
          >
            📊 查看体检报告
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/timetable?versionId=${versionId ?? ''}`)}
          >
            📅 返回课表查看
          </Button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 pb-12">
        {/* ===== 版本概览横幅 ===== */}
        {activeVersion && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-5 shadow-sm">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-[color:var(--text-primary)]">
                  {activeVersion.name}
                </span>
                {activeVersion.isPublished && <Badge tone="green">已发布</Badge>}
                <Badge tone="brand">Excel 2007+ (.xlsx)</Badge>
              </div>
              <p className="text-xs text-[color:var(--text-secondary)]">
                当前版本共排定 {lessons.length} 节课程 · 包含 {meta.classes.length} 个班级、{meta.teachers.filter((t) => t.enabled).length} 名教师、{meta.classrooms.filter((r) => r.enabled).length} 间教室
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                disabled={exportingCard !== null}
                onClick={() =>
                  handleExport('quick_overview', {
                    view: 'overview',
                    scope: 'overview',
                    stageId: selectedStageId
                  })
                }
              >
                {exportingCard === 'quick_overview' ? '正在导出...' : '⚡ 一键导出全校总课表'}
              </Button>
            </div>
          </div>
        )}

        {/* ===== 导出功能卡片网格 ===== */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* 1. 班级课表 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <span>🏫</span> 班级课表导出
                </CardTitle>
                <Badge tone="brand">常用</Badge>
              </div>
              <p className="text-xs text-[color:var(--text-secondary)]">
                支持批量导出全学段所有班级（每个班级独立工作表），或导出指定单个班级
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded-lg border p-2.5 text-xs font-medium transition-all ${
                    classExportMode === 'batch'
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                      : 'border-[color:var(--border-subtle)] hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setClassExportMode('batch')}
                >
                  批量导出全部班级
                  <span className="block text-[11px] font-normal text-[color:var(--text-secondary)]">
                    生成含 {stageClasses.length} 个 Sheet 的 Excel 工作簿
                  </span>
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-lg border p-2.5 text-xs font-medium transition-all ${
                    classExportMode === 'single'
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                      : 'border-[color:var(--border-subtle)] hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setClassExportMode('single')}
                >
                  导出单个班级
                  <span className="block text-[11px] font-normal text-[color:var(--text-secondary)]">
                    仅导出指定班级的精美课表
                  </span>
                </button>
              </div>

              {classExportMode === 'single' && (
                <div>
                  <label className="text-xs font-medium text-[color:var(--text-secondary)]">
                    选择班级:
                  </label>
                  <Select
                    value={selectedClassId ?? ''}
                    onChange={(e) => setSelectedClassId(Number(e.target.value))}
                  >
                    {stageClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <Button
                variant="default"
                disabled={exportingCard !== null}
                onClick={() =>
                  handleExport('class', {
                    view: 'class',
                    scope: classExportMode === 'batch' ? 'all_classes' : 'current',
                    targetId: classExportMode === 'single' ? selectedClassId : undefined,
                    stageId: selectedStageId
                  })
                }
              >
                {exportingCard === 'class'
                  ? '正在导出班级课表...'
                  : classExportMode === 'batch'
                    ? `导出全部班级课表 (${stageClasses.length} 个班)`
                    : '导出当前选中班级课表'}
              </Button>
            </CardContent>
          </Card>

          {/* 2. 教师课表 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <span>👨‍🏫</span> 教师课表导出
                </CardTitle>
                <Badge tone="green">全校</Badge>
              </div>
              <p className="text-xs text-[color:var(--text-secondary)]">
                支持批量导出全校所有在职教师课表（一师一表），或导出指定任课教师
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded-lg border p-2.5 text-xs font-medium transition-all ${
                    teacherExportMode === 'batch'
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                      : 'border-[color:var(--border-subtle)] hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setTeacherExportMode('batch')}
                >
                  批量导出全部教师
                  <span className="block text-[11px] font-normal text-[color:var(--text-secondary)]">
                    生成全校 {meta.teachers.filter((t) => t.enabled).length} 位教师的多 Sheet 工作簿
                  </span>
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-lg border p-2.5 text-xs font-medium transition-all ${
                    teacherExportMode === 'single'
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                      : 'border-[color:var(--border-subtle)] hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setTeacherExportMode('single')}
                >
                  导出单个教师
                  <span className="block text-[11px] font-normal text-[color:var(--text-secondary)]">
                    仅导出指定教师的任课课表
                  </span>
                </button>
              </div>

              {teacherExportMode === 'single' && (
                <div>
                  <label className="text-xs font-medium text-[color:var(--text-secondary)]">
                    选择教师:
                  </label>
                  <Select
                    value={selectedTeacherId ?? ''}
                    onChange={(e) => setSelectedTeacherId(Number(e.target.value))}
                  >
                    {meta.teachers
                      .filter((t) => t.enabled)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.staffNo ? `(${t.staffNo})` : ''}
                        </option>
                      ))}
                  </Select>
                </div>
              )}

              <Button
                variant="default"
                disabled={exportingCard !== null}
                onClick={() =>
                  handleExport('teacher', {
                    view: 'teacher',
                    scope: teacherExportMode === 'batch' ? 'all_teachers' : 'current',
                    targetId: teacherExportMode === 'single' ? selectedTeacherId : undefined
                  })
                }
              >
                {exportingCard === 'teacher'
                  ? '正在导出教师课表...'
                  : teacherExportMode === 'batch'
                    ? `导出全校教师课表 (${meta.teachers.filter((t) => t.enabled).length} 位)`
                    : '导出当前选中教师课表'}
              </Button>
            </CardContent>
          </Card>

          {/* 3. 教室课表 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <span>🏛️</span> 教室场地课表导出
                </CardTitle>
                <Badge tone="slate">场地</Badge>
              </div>
              <p className="text-xs text-[color:var(--text-secondary)]">
                支持批量导出实验室、计算机房、音乐美术专用教室及普通教室占用课表
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded-lg border p-2.5 text-xs font-medium transition-all ${
                    roomExportMode === 'batch'
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                      : 'border-[color:var(--border-subtle)] hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setRoomExportMode('batch')}
                >
                  批量导出全部教室
                  <span className="block text-[11px] font-normal text-[color:var(--text-secondary)]">
                    生成全校 {meta.classrooms.filter((r) => r.enabled).length} 间场地的多 Sheet 表
                  </span>
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-lg border p-2.5 text-xs font-medium transition-all ${
                    roomExportMode === 'single'
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                      : 'border-[color:var(--border-subtle)] hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setRoomExportMode('single')}
                >
                  导出单个教室
                  <span className="block text-[11px] font-normal text-[color:var(--text-secondary)]">
                    导出指定教室课表与使用安排
                  </span>
                </button>
              </div>

              {roomExportMode === 'single' && (
                <div>
                  <label className="text-xs font-medium text-[color:var(--text-secondary)]">
                    选择教室:
                  </label>
                  <Select
                    value={selectedRoomId ?? ''}
                    onChange={(e) => setSelectedRoomId(Number(e.target.value))}
                  >
                    {meta.classrooms
                      .filter((r) => r.enabled)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} {r.building ? `(${r.building})` : ''}
                        </option>
                      ))}
                  </Select>
                </div>
              )}

              <Button
                variant="default"
                disabled={exportingCard !== null}
                onClick={() =>
                  handleExport('room', {
                    view: 'room',
                    scope: roomExportMode === 'batch' ? 'all_rooms' : 'current',
                    targetId: roomExportMode === 'single' ? selectedRoomId : undefined
                  })
                }
              >
                {exportingCard === 'room'
                  ? '正在导出教室课表...'
                  : roomExportMode === 'batch'
                    ? `导出全部教室课表 (${meta.classrooms.filter((r) => r.enabled).length} 间)`
                    : '导出当前选中教室课表'}
              </Button>
            </CardContent>
          </Card>

          {/* 4. 全校总课表 (Overview) */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <span>📊</span> 全景总课表导出
                </CardTitle>
                <Badge tone="amber">教务总表</Badge>
              </div>
              <p className="text-xs text-[color:var(--text-secondary)]">
                导出包含全学段所有年级、班级与节次的全景横向总课表，便于教务处巡课与归档
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-lg border border-[color:var(--border-subtle)] bg-slate-50/60 p-3 text-xs leading-relaxed text-[color:var(--text-secondary)] dark:bg-slate-800/40">
                <div className="font-semibold text-[color:var(--text-primary)]">总表规格说明：</div>
                • 横向展开周一至周五全部时段，竖向对齐各年级与班级；<br />
                • 标注科目、授课教师、上课教室及预排锁定标记；<br />
                • 末尾自动统计全校班级数、总课节数、授课教师及空位分布。
              </div>

              <Button
                variant="default"
                disabled={exportingCard !== null}
                onClick={() =>
                  handleExport('overview', {
                    view: 'overview',
                    scope: 'overview',
                    stageId: selectedStageId
                  })
                }
              >
                {exportingCard === 'overview' ? '正在导出总课表...' : '导出全景总课表 (Excel)'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
