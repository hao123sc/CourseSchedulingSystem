import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@renderer/lib/api'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { useMetaStore } from '@renderer/stores/metaStore'
import { toast } from '@renderer/stores/toastStore'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Select } from '@renderer/components/ui/select'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { PosterExportModal } from '@renderer/components/timetable/PosterExportModal'
import {
  TimetablePrintModal,
  type PrintViewType
} from '@renderer/components/timetable/TimetablePrintModal'
import type { FixedLesson, Lesson, ScheduleVersion } from '@shared/types/entities'
import type { TimetableExportScope, TimetableLayoutOptions } from '@shared/types/ipc'

export function ExportCenterPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { school, currentSemester, loaded, load } = useSchoolStore()
  const meta = useMetaStore()
  const semesterId = currentSemester?.id ?? null

  const [versions, setVersions] = useState<ScheduleVersion[]>([])
  const [versionId, setVersionId] = useState<number | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [fixedLessons, setFixedLessons] = useState<FixedLesson[]>([])
  const [loading, setLoading] = useState(false)
  const [exportingCard, setExportingCard] = useState<string | null>(null)
  const [posterModalOpen, setPosterModalOpen] = useState(false)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printInitialView, setPrintInitialView] = useState<PrintViewType>('class')
  const [printInitialTargetId, setPrintInitialTargetId] = useState<number | null>(null)

  // A4 排版与自定义参数
  const [showLayoutConfig, setShowLayoutConfig] = useState(false)
  const [paperSize, setPaperSize] = useState<'A4' | 'A3'>('A4')
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [customHeader, setCustomHeader] = useState('')
  const [customFooter, setCustomFooter] = useState('智课排智能排课系统 · 正式课表')

  // 实体导出选择状态
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null)
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null)

  const [classExportMode, setClassExportMode] = useState<'batch' | 'single'>('batch')
  const [teacherExportMode, setTeacherExportMode] = useState<'batch' | 'single'>('batch')
  const [roomExportMode, setRoomExportMode] = useState<'batch' | 'single'>('batch')

  const handleOpenPrintModal = (view: PrintViewType, targetId?: number | null): void => {
    setPrintInitialView(view)
    setPrintInitialTargetId(targetId ?? null)
    setPrintModalOpen(true)
  }

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    if (semesterId != null) void meta.load(semesterId)
  }, [semesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 读取排课版本与预排锁定
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

    api['fixedLesson:list'](semesterId)
      .then((rows) => alive && setFixedLessons(rows))
      .catch(() => alive && setFixedLessons([]))

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
  }, [
    meta.stages,
    meta.classes,
    meta.teachers,
    meta.classrooms,
    selectedStageId,
    selectedClassId,
    selectedTeacherId,
    selectedRoomId
  ])

  const activeVersion = useMemo(
    () => versions.find((v) => v.id === versionId) ?? null,
    [versions, versionId]
  )

  const stageClasses = useMemo(() => {
    if (selectedStageId == null) return meta.classes
    const stageGradeIds = new Set(
      meta.grades.filter((g) => g.stageId === selectedStageId).map((g) => g.id)
    )
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

    const layoutOptions: TimetableLayoutOptions = {
      paperSize,
      orientation,
      fitToPage: true,
      customHeader: customHeader.trim() || undefined,
      customFooter: customFooter.trim() || undefined
    }

    setExportingCard(cardKey)
    try {
      const res = await api['timetable:exportExcel']({
        semesterId,
        versionId,
        stageId: params.stageId ?? selectedStageId,
        view: params.view,
        targetId: params.targetId ?? null,
        scope: params.scope,
        layoutOptions
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
            variant="default"
            size="sm"
            onClick={() => handleOpenPrintModal('class')}
            className="gap-1.5 bg-brand-600 font-semibold text-white hover:bg-brand-700"
            title="打开课表批量与选择打印中心 (A4自适应单页排版)"
          >
            🖨️ 课表打印中心 (批量/选择)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPosterModalOpen(true)}
            className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
          >
            🖼️ 大幅海报图片导出
          </Button>
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
                <Badge tone="slate">A4 单页打印优化</Badge>
              </div>
              <p className="text-xs text-[color:var(--text-secondary)]">
                当前版本共排定 {lessons.length} 节课程 · 包含 {meta.classes.length} 个班级、
                {meta.teachers.filter((t) => t.enabled).length} 名教师、
                {meta.classrooms.filter((r) => r.enabled).length} 间教室
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenPrintModal('class')}
                className="gap-1.5 border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300"
              >
                🖨️ 批量打印课表 (A4)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPosterModalOpen(true)}
                className="gap-1.5 border-brand-300 text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300"
              >
                🖼️ 广告公司海报图 (300DPI)
              </Button>
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
                {exportingCard === 'quick_overview'
                  ? '正在导出...'
                  : '⚡ 一键导出全校总课表 (Excel)'}
              </Button>
            </div>
          </div>
        )}

        {/* ===== A4 纸排版与自定义版式配置栏 ===== */}
        <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-4 shadow-xs">
          <div
            className="flex cursor-pointer items-center justify-between"
            onClick={() => setShowLayoutConfig(!showLayoutConfig)}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">📄</span>
              <span className="text-sm font-semibold text-[color:var(--text-primary)]">
                A4 / A3 纸张打印与自定义排版设置
              </span>
              <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                {paperSize} {orientation === 'landscape' ? '横向 (推荐单页铺满)' : '纵向'}
              </span>
            </div>
            <span className="text-xs text-[color:var(--text-secondary)]">
              {showLayoutConfig ? '收起配置 ▲' : '展开自定义排版选项 ▼'}
            </span>
          </div>

          {showLayoutConfig && (
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-[color:var(--border-subtle)] pt-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-xs font-medium text-[color:var(--text-secondary)]">
                  纸张大小
                </label>
                <Select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value as 'A4' | 'A3')}
                  className="mt-1"
                >
                  <option value="A4">A4 纸张 (210 × 297 mm · 标准推荐)</option>
                  <option value="A3">A3 纸张 (297 × 420 mm · 大版面)</option>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-[color:var(--text-secondary)]">
                  打印方向
                </label>
                <Select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
                  className="mt-1"
                >
                  <option value="landscape">横向排版 (自适应单页 · 最佳体验)</option>
                  <option value="portrait">纵向排版</option>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-[color:var(--text-secondary)]">
                  自定义页眉大标题 (可选)
                </label>
                <Input
                  value={customHeader}
                  onChange={(e) => setCustomHeader(e.target.value)}
                  placeholder="留空自动生成学校名称与学期"
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[color:var(--text-secondary)]">
                  自定义页脚审批签名 (可选)
                </label>
                <Input
                  value={customFooter}
                  onChange={(e) => setCustomFooter(e.target.value)}
                  placeholder="如：教务处审核：______ 校长审批：______"
                  className="mt-1 h-9 text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* ===== 导出功能卡片网格 ===== */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* 1. 班级课表 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <span>🏫</span> 班级课表导出
                </CardTitle>
                <Badge tone="brand">A4 单页适配</Badge>
              </div>
              <p className="text-xs text-[color:var(--text-secondary)]">
                支持批量导出全学段所有班级（每个班级独立工作表，自动配置单页 A4
                打印），或导出指定单个班级
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

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="default"
                  className="flex-1 gap-1.5 bg-brand-600 font-semibold text-white hover:bg-brand-700"
                  onClick={() =>
                    handleOpenPrintModal(
                      'class',
                      classExportMode === 'single' ? selectedClassId : null
                    )
                  }
                >
                  🖨️ {classExportMode === 'batch' ? '批量打印班级课表 (A4)' : '打印选中班级课表'}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
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
                    ? '正在导出...'
                    : classExportMode === 'batch'
                      ? `导出全部 Excel (${stageClasses.length} 个班)`
                      : '导出当前班 Excel'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 2. 教师课表 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <span>👨‍🏫</span> 教师课表导出与打印
                </CardTitle>
                <Badge tone="green">A4 单页适配</Badge>
              </div>
              <p className="text-xs text-[color:var(--text-secondary)]">
                支持批量打印或导出全校所有任课教师课表（每位教师独立单页），或打印指定教师课表
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
                  批量导出/打印全校教师
                  <span className="block text-[11px] font-normal text-[color:var(--text-secondary)]">
                    涵盖 {meta.teachers.filter((t) => t.enabled).length} 位教师
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
                  导出/打印单个教师
                  <span className="block text-[11px] font-normal text-[color:var(--text-secondary)]">
                    仅打印指定教师的任课课表
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

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="default"
                  className="flex-1 gap-1.5 bg-brand-600 font-semibold text-white hover:bg-brand-700"
                  onClick={() =>
                    handleOpenPrintModal(
                      'teacher',
                      teacherExportMode === 'single' ? selectedTeacherId : null
                    )
                  }
                >
                  🖨️ {teacherExportMode === 'batch' ? '批量打印教师课表 (A4)' : '打印选中教师课表'}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
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
                    ? '正在导出...'
                    : teacherExportMode === 'batch'
                      ? `导出全部 Excel (${meta.teachers.filter((t) => t.enabled).length} 位)`
                      : '导出当前教师 Excel'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 3. 教室课表 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <span>🏛️</span> 教室场地课表导出与打印
                </CardTitle>
                <Badge tone="slate">场地</Badge>
              </div>
              <p className="text-xs text-[color:var(--text-secondary)]">
                支持批量打印或导出实验室、计算机房、专用教室及普通教室占用课表
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
                  批量导出/打印全部教室
                  <span className="block text-[11px] font-normal text-[color:var(--text-secondary)]">
                    涵盖 {meta.classrooms.filter((r) => r.enabled).length} 间场地
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
                  导出/打印单个教室
                  <span className="block text-[11px] font-normal text-[color:var(--text-secondary)]">
                    打印指定教室课表与使用安排
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

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="default"
                  className="flex-1 gap-1.5 bg-brand-600 font-semibold text-white hover:bg-brand-700"
                  onClick={() =>
                    handleOpenPrintModal(
                      'room',
                      roomExportMode === 'single' ? selectedRoomId : null
                    )
                  }
                >
                  🖨️ {roomExportMode === 'batch' ? '批量打印教室课表 (A4)' : '打印选中教室课表'}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
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
                    ? '正在导出...'
                    : roomExportMode === 'batch'
                      ? `导出全部 Excel (${meta.classrooms.filter((r) => r.enabled).length} 间)`
                      : '导出当前教室 Excel'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 4. 全校总课表 (Overview + Poster) */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <span>📊</span> 全景总课表 & 广告大幅喷绘
                </CardTitle>
                <Badge tone="amber">大幅面打印</Badge>
              </div>
              <p className="text-xs text-[color:var(--text-secondary)]">
                导出全景横向总课表 Excel，或生成 150~300 DPI
                超高分辨率海报图片供广告公司大型喷绘张贴
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-lg border border-[color:var(--border-subtle)] bg-slate-50/60 p-3 text-xs leading-relaxed text-[color:var(--text-secondary)] dark:bg-slate-800/40">
                <div className="font-semibold text-[color:var(--text-primary)]">
                  大幅面印刷与张贴说明：
                </div>
                • <strong>广告喷绘海报：</strong>支持 300 DPI
                高精位图输出，内置学科调色板与教务签名栏，适合制作 1.5~3 米巨幅展板；
                <br />• <strong>全景 Excel：</strong>横向展开周一至周五全部时段，自动配置 A3
                跨页居中打印。
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="default"
                  className="flex-1 gap-1.5 bg-brand-600 text-white hover:bg-brand-700"
                  onClick={() => setPosterModalOpen(true)}
                >
                  🖼️ 导出大幅海报图片 (广告公司张贴)
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={exportingCard !== null}
                  onClick={() =>
                    handleExport('overview', {
                      view: 'overview',
                      scope: 'overview',
                      stageId: selectedStageId
                    })
                  }
                >
                  {exportingCard === 'overview' ? '正在导出总表...' : '导出 Excel 总课表'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 课表批量与选择打印模态框 */}
      {semesterId != null && (
        <TimetablePrintModal
          open={printModalOpen}
          onClose={() => setPrintModalOpen(false)}
          semesterId={semesterId}
          versionId={versionId}
          stageId={selectedStageId}
          initialView={printInitialView}
          initialTargetId={printInitialTargetId}
          schoolName={school?.name}
          semesterName={currentSemester?.name}
          versionName={activeVersion?.name}
          classes={meta.classes}
          grades={meta.grades}
          stages={meta.stages}
          slotsByStage={meta.slotsByStage}
          lessons={lessons}
          fixedLessons={fixedLessons}
          subjects={meta.subjects}
          teachers={meta.teachers}
          classrooms={meta.classrooms}
        />
      )}

      {/* 大幅面海报导出模态框 */}
      {semesterId != null && (
        <PosterExportModal
          open={posterModalOpen}
          onClose={() => setPosterModalOpen(false)}
          semesterId={semesterId}
          versionId={versionId}
          stageId={selectedStageId}
          stageName={meta.stages.find((s) => s.id === selectedStageId)?.name}
          schoolName={school?.name}
          semesterName={currentSemester?.name}
          versionName={activeVersion?.name}
          classes={meta.classes}
          grades={meta.grades}
          slots={selectedStageId ? (meta.slotsByStage[selectedStageId] ?? []) : []}
          lessons={lessons}
          fixedLessons={fixedLessons}
          subjects={meta.subjects}
          teachers={meta.teachers}
          classrooms={meta.classrooms}
        />
      )}
    </div>
  )
}
