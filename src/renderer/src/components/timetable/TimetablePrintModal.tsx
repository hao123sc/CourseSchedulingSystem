import * as React from 'react'
import { useState, useMemo, useEffect } from 'react'
import { Modal } from '@renderer/components/ui/modal'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import { toast } from '@renderer/stores/toastStore'
import { cn } from '@renderer/lib/utils'
import {
  buildSingleTimetableExportSheet,
  type SingleTimetableExportSheet,
  type ExportMetaContext
} from '@shared/timetableExport'
import { PrintableTimetableSheet } from './PrintableTimetableSheet'
import type {
  Classroom,
  FixedLesson,
  Grade,
  Klass,
  Lesson,
  Stage,
  Subject,
  Teacher,
  TimeSlot
} from '@shared/types/entities'

export type PrintViewType = 'class' | 'teacher' | 'room'

export interface TimetablePrintModalProps {
  open: boolean
  onClose: () => void
  semesterId: number
  versionId: number | null
  stageId?: number | null
  initialView?: PrintViewType
  initialTargetId?: number | null
  schoolName?: string
  semesterName?: string
  versionName?: string
  classes: Klass[]
  grades: Grade[]
  stages: Stage[]
  slotsByStage: Record<number, TimeSlot[]>
  lessons: Lesson[]
  fixedLessons: FixedLesson[]
  subjects: Subject[]
  teachers: Teacher[]
  classrooms: Classroom[]
}

interface SelectableEntity {
  id: number
  name: string
  subText: string
  stageId?: number | null
  gradeId?: number | null
  subjectIds?: number[]
  roomType?: string
}

export function TimetablePrintModal({
  open,
  onClose,
  stageId,
  initialView = 'class',
  initialTargetId,
  schoolName = '学校',
  semesterName = '本学期',
  versionName = '正式课表',
  classes,
  grades,
  stages,
  slotsByStage,
  lessons,
  fixedLessons,
  subjects,
  teachers,
  classrooms
}: TimetablePrintModalProps): React.JSX.Element | null {
  // 当前视图模式
  const [view, setView] = useState<PrintViewType>(initialView)

  // 筛选器状态
  const [filterStageId, setFilterStageId] = useState<number | 'all'>('all')
  const [filterGradeId, setFilterGradeId] = useState<number | 'all'>('all')
  const [filterSubjectId, setFilterSubjectId] = useState<number | 'all'>('all')
  const [filterRoomType, setFilterRoomType] = useState<string | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // 实体勾选集合
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // 当前实时预览的实体 ID
  const [previewId, setPreviewId] = useState<number | null>(null)

  // 排版与打印选项
  const [paperSize, setPaperSize] = useState<'A4' | 'A3'>('A4')
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [showTimeRange, setShowTimeRange] = useState(true)
  const [showSubInfo, setShowSubInfo] = useState(true)
  const [showSignatures, setShowSignatures] = useState(true)
  const [showStats, setShowStats] = useState(true)
  const [colorMode, setColorMode] = useState<'clean' | 'subtle' | 'mono'>('subtle')
  const [showAdvancedHeaders, setShowAdvancedHeaders] = useState(false)
  const [customHeader, setCustomHeader] = useState('')
  const [customFooter, setCustomFooter] = useState(
    '班主任/教师签名：________________    教务处审核：________________    校长审批：________________'
  )

  const [isPrinting, setIsPrinting] = useState(false)

  // 初始化或切换初始视图
  useEffect(() => {
    if (open) {
      setView(initialView)
      if (stageId != null) {
        setFilterStageId(stageId)
      } else {
        setFilterStageId('all')
      }
    }
  }, [open, initialView, stageId])

  // 基础映射
  const gradeById = useMemo(() => new Map(grades.map((g) => [g.id, g])), [grades])
  const gradeOfClass = useMemo(() => new Map(classes.map((c) => [c.id, c.gradeId])), [classes])

  // 构建当前视图下的可选实体全集
  const allEntities = useMemo<SelectableEntity[]>(() => {
    if (view === 'class') {
      return classes.map((c) => {
        const grade = gradeById.get(c.gradeId)
        return {
          id: c.id,
          name: c.name,
          subText: `${grade?.name ?? ''} · ${c.studentCount}人`,
          stageId: grade?.stageId ?? null,
          gradeId: c.gradeId
        }
      })
    }
    if (view === 'teacher') {
      return teachers
        .filter((t) => t.enabled)
        .map((t) => {
          const subNames = t.subjectIds
            .map((sid) => subjects.find((s) => s.id === sid)?.name)
            .filter(Boolean)
            .join('/')
          return {
            id: t.id,
            name: t.name,
            subText: subNames ? `${subNames} · ${t.staffNo || '教师'}` : t.staffNo || '教师',
            subjectIds: t.subjectIds
          }
        })
    }
    // room
    return classrooms
      .filter((r) => r.enabled)
      .map((r) => ({
        id: r.id,
        name: r.name,
        subText: `${r.building ? `${r.building} · ` : ''}${r.roomType === 'normal' ? '普通教室' : '专用场地'} · ${r.capacity}座`,
        roomType: r.roomType
      }))
  }, [view, classes, teachers, classrooms, gradeById, subjects])

  // 过滤后的可选实体列表
  const filteredEntities = useMemo(() => {
    return allEntities.filter((e) => {
      // 关键字搜索
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        if (!e.name.toLowerCase().includes(q) && !e.subText.toLowerCase().includes(q)) {
          return false
        }
      }

      // 班级视图筛选
      if (view === 'class') {
        if (filterStageId !== 'all' && e.stageId !== filterStageId) return false
        if (filterGradeId !== 'all' && e.gradeId !== filterGradeId) return false
      }

      // 教师视图筛选
      if (view === 'teacher') {
        if (filterSubjectId !== 'all' && !e.subjectIds?.includes(filterSubjectId)) return false
      }

      // 教室视图筛选
      if (view === 'room') {
        if (filterRoomType !== 'all' && e.roomType !== filterRoomType) return false
      }

      return true
    })
  }, [
    allEntities,
    searchQuery,
    view,
    filterStageId,
    filterGradeId,
    filterSubjectId,
    filterRoomType
  ])

  // 当切换视图或重开时，默认选中全部过滤出的实体或指定的初始实体
  useEffect(() => {
    if (!open) return
    if (initialTargetId != null && allEntities.some((e) => e.id === initialTargetId)) {
      setSelectedIds(new Set([initialTargetId]))
      setPreviewId(initialTargetId)
    } else {
      const initialIds = new Set(filteredEntities.map((e) => e.id))
      setSelectedIds(initialIds)
      setPreviewId(filteredEntities[0]?.id ?? null)
    }
  }, [view, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // 如果当前预览的实体不在全集中，自动校正预览实体
  useEffect(() => {
    if (previewId == null || !allEntities.some((e) => e.id === previewId)) {
      setPreviewId(filteredEntities[0]?.id ?? allEntities[0]?.id ?? null)
    }
  }, [allEntities, filteredEntities, previewId])

  // 批量全选 / 反选 / 清空
  const handleSelectAllVisible = (): void => {
    const next = new Set(selectedIds)
    filteredEntities.forEach((e) => next.add(e.id))
    setSelectedIds(next)
  }

  const handleInvertSelection = (): void => {
    const next = new Set(selectedIds)
    filteredEntities.forEach((e) => {
      if (next.has(e.id)) next.delete(e.id)
      else next.add(e.id)
    })
    setSelectedIds(next)
  }

  const handleClearSelection = (): void => {
    setSelectedIds(new Set())
  }

  const handleToggleItem = (id: number): void => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  // 元数据上下文
  const metaContext: ExportMetaContext = useMemo(
    () => ({
      schoolName,
      semesterName,
      versionName,
      subjects,
      teachers,
      classrooms,
      classes,
      grades
    }),
    [schoolName, semesterName, versionName, subjects, teachers, classrooms, classes, grades]
  )

  // 辅助：获取某个实体的对应时段列表
  const getSlotsForTarget = (targetId: number, targetView: PrintViewType): TimeSlot[] => {
    if (targetView === 'class') {
      const c = classes.find((cl) => cl.id === targetId)
      const gid = c?.gradeId
      const g = gid != null ? gradeById.get(gid) : undefined
      const sid = g?.stageId ?? stages[0]?.id ?? 1
      return slotsByStage[sid] ?? []
    }
    if (targetView === 'teacher') {
      const teacherLesson = lessons.find((l) => l.teacherId === targetId)
      if (teacherLesson?.classId != null) {
        const gid = gradeOfClass.get(teacherLesson.classId)
        const g = gid != null ? gradeById.get(gid) : undefined
        if (g?.stageId && slotsByStage[g.stageId]) return slotsByStage[g.stageId]
      }
      const sid = stageId ?? stages[0]?.id ?? 1
      return slotsByStage[sid] ?? []
    }
    // room
    const roomLesson = lessons.find((l) => l.classroomId === targetId)
    if (roomLesson?.classId != null) {
      const gid = gradeOfClass.get(roomLesson.classId)
      const g = gid != null ? gradeById.get(gid) : undefined
      if (g?.stageId && slotsByStage[g.stageId]) return slotsByStage[g.stageId]
    }
    const sid = stageId ?? stages[0]?.id ?? 1
    return slotsByStage[sid] ?? []
  }

  // 生成实时预览的 Sheet
  const previewSheet = useMemo<SingleTimetableExportSheet | null>(() => {
    if (previewId == null) return null
    const slots = getSlotsForTarget(previewId, view)
    return buildSingleTimetableExportSheet({
      view,
      targetId: previewId,
      slots,
      lessons,
      fixedLessons,
      meta: metaContext
    })
  }, [previewId, view, lessons, fixedLessons, metaContext]) // eslint-disable-line react-hooks/exhaustive-deps

  // 构建待打印的全部 Sheet 列表
  const sheetsToPrint = useMemo<SingleTimetableExportSheet[]>(() => {
    const list: SingleTimetableExportSheet[] = []
    const orderedTargets = allEntities.filter((e) => selectedIds.has(e.id))
    for (const item of orderedTargets) {
      const slots = getSlotsForTarget(item.id, view)
      const sheet = buildSingleTimetableExportSheet({
        view,
        targetId: item.id,
        slots,
        lessons,
        fixedLessons,
        meta: metaContext
      })
      if (sheet) list.push(sheet)
    }
    return list
  }, [allEntities, selectedIds, view, lessons, fixedLessons, metaContext]) // eslint-disable-line react-hooks/exhaustive-deps

  // 预览分页导航（在已选中的列表中翻页预览）
  const selectedList = useMemo(
    () => allEntities.filter((e) => selectedIds.has(e.id)),
    [allEntities, selectedIds]
  )
  const currentPreviewIndex = useMemo(
    () => selectedList.findIndex((e) => e.id === previewId),
    [selectedList, previewId]
  )

  const handlePrevPreview = (): void => {
    if (currentPreviewIndex > 0) {
      setPreviewId(selectedList[currentPreviewIndex - 1].id)
    }
  }

  const handleNextPreview = (): void => {
    if (currentPreviewIndex >= 0 && currentPreviewIndex < selectedList.length - 1) {
      setPreviewId(selectedList[currentPreviewIndex + 1].id)
    }
  }

  // 触发批量打印
  const handlePrint = (): void => {
    if (sheetsToPrint.length === 0) {
      toast.error('请至少选择一张课表进行打印')
      return
    }

    setIsPrinting(true)
    setTimeout(() => {
      window.print()
      setIsPrinting(false)
      toast.success(`已发起打印！共 ${sheetsToPrint.length} 份课表 (A4 自适应单页)`)
    }, 150)
  }

  if (!open) return null

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="🖨️ 课表批量与选择打印中心"
        description="支持全校班级、任课教师与专用教室课表的 A4 自适应排版、灵活多选与批量连续打印。"
        className="max-h-[92vh] h-[92vh] max-w-[min(98vw,80rem)] p-0 flex flex-col"
        footer={
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span>已选定：</span>
              <Badge tone={selectedIds.size > 0 ? 'green' : 'slate'} className="font-bold">
                {selectedIds.size} / {allEntities.length} 份课表
              </Badge>
              <span>（预计打印 {selectedIds.size} 页 A4 纸）</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                取消
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={selectedIds.size === 0 || isPrinting}
                onClick={handlePrint}
                className="gap-1.5 bg-brand-600 font-semibold text-white hover:bg-brand-700"
              >
                🖨️ 立即打印选中的 {selectedIds.size} 份课表
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          {/* ── 顶栏：视图切换 Tabs 与全局排版配置 ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] pb-3">
            {/* 课表大类选择 (总表除外) */}
            <div className="flex rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--panel)] p-1">
              <button
                type="button"
                onClick={() => setView('class')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                  view === 'class'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                )}
              >
                <span>🏫</span> 班级课表
              </button>
              <button
                type="button"
                onClick={() => setView('teacher')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                  view === 'teacher'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                )}
              >
                <span>👨‍🏫</span> 教师课表
              </button>
              <button
                type="button"
                onClick={() => setView('room')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                  view === 'room'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                )}
              >
                <span>🏛️</span> 教室场地课表
              </button>
            </div>

            {/* 排版快捷设置 */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-[color:var(--text-secondary)]">纸张:</span>
                <Select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value as 'A4' | 'A3')}
                  className="h-8 w-24 text-xs"
                >
                  <option value="A4">A4 纸</option>
                  <option value="A3">A3 纸</option>
                </Select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[color:var(--text-secondary)]">方向:</span>
                <Select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
                  className="h-8 w-28 text-xs"
                >
                  <option value="landscape">横向 (推荐)</option>
                  <option value="portrait">纵向</option>
                </Select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[color:var(--text-secondary)]">配色:</span>
                <Select
                  value={colorMode}
                  onChange={(e) => setColorMode(e.target.value as 'clean' | 'subtle' | 'mono')}
                  className="h-8 w-28 text-xs"
                >
                  <option value="subtle">柔和色彩</option>
                  <option value="mono">经典黑白</option>
                  <option value="clean">极简浅灰</option>
                </Select>
              </div>
            </div>
          </div>

          {/* ── 主体两栏：左侧选择控制台 + 右侧实时真实 A4 预览 ── */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-12">
            {/* 左侧实体选择与筛选栏 (占 5 列) */}
            <div className="flex min-h-0 flex-col rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--panel)] p-3 lg:col-span-5">
              {/* 筛选工具行 */}
              <div className="flex flex-col gap-2 border-b border-[color:var(--border-subtle)] pb-2.5">
                <div className="flex gap-2">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      view === 'class'
                        ? '搜索班级名…'
                        : view === 'teacher'
                          ? '搜索教师姓名/学科…'
                          : '搜索教室场地…'
                    }
                    className="h-8 flex-1 text-xs"
                  />
                  {stages.length > 1 && view === 'class' && (
                    <Select
                      value={filterStageId}
                      onChange={(e) => {
                        const v = e.target.value
                        setFilterStageId(v === 'all' ? 'all' : Number(v))
                        setFilterGradeId('all')
                      }}
                      className="h-8 w-24 text-xs"
                    >
                      <option value="all">全部学段</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  )}
                  {view === 'class' && (
                    <Select
                      value={filterGradeId}
                      onChange={(e) => {
                        const v = e.target.value
                        setFilterGradeId(v === 'all' ? 'all' : Number(v))
                      }}
                      className="h-8 w-24 text-xs"
                    >
                      <option value="all">全部年级</option>
                      {grades
                        .filter((g) => filterStageId === 'all' || g.stageId === filterStageId)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </Select>
                  )}
                  {view === 'teacher' && (
                    <Select
                      value={filterSubjectId}
                      onChange={(e) => {
                        const v = e.target.value
                        setFilterSubjectId(v === 'all' ? 'all' : Number(v))
                      }}
                      className="h-8 w-28 text-xs"
                    >
                      <option value="all">全部学科</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  )}
                  {view === 'room' && (
                    <Select
                      value={filterRoomType}
                      onChange={(e) => setFilterRoomType(e.target.value)}
                      className="h-8 w-28 text-xs"
                    >
                      <option value="all">全部类型</option>
                      <option value="normal">普通教室</option>
                      <option value="lab">实验室/微机</option>
                      <option value="art">艺术/专用</option>
                      <option value="pe">体育场地</option>
                    </Select>
                  )}
                </div>

                {/* 快捷批量选择按钮 */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllVisible}
                      className="h-7 px-2 text-[11px]"
                      title="勾选当前列表中的所有项"
                    >
                      全选
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleInvertSelection}
                      className="h-7 px-2 text-[11px]"
                      title="反转当前列表选中状态"
                    >
                      反选
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearSelection}
                      className="h-7 px-2 text-[11px]"
                    >
                      清空
                    </Button>
                  </div>

                  <span className="text-[11px] text-[color:var(--text-secondary)]">
                    匹配到 <strong>{filteredEntities.length}</strong> 项 · 已勾选{' '}
                    <strong className="text-brand-600">{selectedIds.size}</strong> 项
                  </span>
                </div>
              </div>

              {/* 实体勾选列表 */}
              <div className="min-h-0 flex-1 overflow-y-auto pr-1 pt-2">
                {filteredEntities.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[color:var(--text-secondary)]">
                    无匹配结果
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1">
                    {filteredEntities.map((entity) => {
                      const isChecked = selectedIds.has(entity.id)
                      const isPreviewing = previewId === entity.id

                      return (
                        <div
                          key={entity.id}
                          className={cn(
                            'group flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs transition-all cursor-pointer',
                            isPreviewing
                              ? 'border-brand-500 bg-brand-50/80 dark:bg-brand-900/30'
                              : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          )}
                          onClick={() => setPreviewId(entity.id)}
                        >
                          <label
                            className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleItem(entity.id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                            <div className="flex flex-col min-w-0">
                              <span
                                className={cn(
                                  'font-medium truncate',
                                  isChecked
                                    ? 'text-slate-900 dark:text-slate-100'
                                    : 'text-slate-700 dark:text-slate-300'
                                )}
                              >
                                {entity.name}
                              </span>
                              <span className="text-[10.5px] text-slate-500 truncate">
                                {entity.subText}
                              </span>
                            </div>
                          </label>

                          <button
                            type="button"
                            onClick={() => setPreviewId(entity.id)}
                            className={cn(
                              'text-[10.5px] px-2 py-0.5 rounded transition-opacity',
                              isPreviewing
                                ? 'bg-brand-600 text-white font-medium'
                                : 'text-slate-400 group-hover:text-brand-600'
                            )}
                          >
                            {isPreviewing ? '正在预览' : '预览'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 底部折叠排版细项 */}
              <div className="mt-2 border-t border-[color:var(--border-subtle)] pt-2 text-[11px] text-slate-600 dark:text-slate-400">
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showTimeRange}
                      onChange={(e) => setShowTimeRange(e.target.checked)}
                    />
                    <span>显示作息时间</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showSubInfo}
                      onChange={(e) => setShowSubInfo(e.target.checked)}
                    />
                    <span>显示教师/场地</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showSignatures}
                      onChange={(e) => setShowSignatures(e.target.checked)}
                    />
                    <span>显示审批签名栏</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showStats}
                      onChange={(e) => setShowStats(e.target.checked)}
                    />
                    <span>显示课时统计</span>
                  </label>
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-[color:var(--border-subtle)] pt-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedHeaders(!showAdvancedHeaders)}
                    className="text-[10.5px] text-brand-600 hover:underline"
                  >
                    {showAdvancedHeaders ? '收起自定义标题与签名 ▲' : '自定义页眉大标题与签名 ▼'}
                  </button>
                </div>

                {showAdvancedHeaders && (
                  <div className="mt-2 flex flex-col gap-2 rounded bg-slate-50 p-2 dark:bg-slate-800/40">
                    <div>
                      <span className="text-[10px] text-slate-500">自定义页眉标题:</span>
                      <Input
                        value={customHeader}
                        onChange={(e) => setCustomHeader(e.target.value)}
                        placeholder="留空自动显示学校+学期名称"
                        className="mt-0.5 h-7 text-[11px]"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">自定义签名栏文案:</span>
                      <Input
                        value={customFooter}
                        onChange={(e) => setCustomFooter(e.target.value)}
                        placeholder="留空使用标准三联审批"
                        className="mt-0.5 h-7 text-[11px]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 右侧实时真实 A4 打印预览 (占 7 列) */}
            <div className="flex min-h-0 flex-col rounded-xl border border-[color:var(--border-subtle)] bg-slate-100/70 p-3 dark:bg-slate-900/50 lg:col-span-7">
              {/* 预览顶栏与分页控制 */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    📄 单页 A4 打印真实效果预览
                  </span>
                  {previewSheet && (
                    <Badge tone="slate" className="text-[11px]">
                      {previewSheet.targetName}
                    </Badge>
                  )}
                </div>

                {/* 翻页预览控制器 */}
                {selectedList.length > 1 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevPreview}
                      disabled={currentPreviewIndex <= 0}
                      className="h-7 px-2 text-[11px]"
                    >
                      ◀ 上一份
                    </Button>
                    <span className="text-[11px] text-slate-600 dark:text-slate-400">
                      第 {currentPreviewIndex >= 0 ? currentPreviewIndex + 1 : '—'} /{' '}
                      {selectedList.length} 份
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPreview}
                      disabled={
                        currentPreviewIndex < 0 || currentPreviewIndex >= selectedList.length - 1
                      }
                      className="h-7 px-2 text-[11px]"
                    >
                      下一份 ▶
                    </Button>
                  </div>
                )}
              </div>

              {/* 预览纸张画布 */}
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2">
                {previewSheet ? (
                  <div className="w-full max-w-2xl bg-white shadow-lg transition-transform">
                    <PrintableTimetableSheet
                      sheet={previewSheet}
                      schoolName={schoolName}
                      semesterName={semesterName}
                      versionName={versionName}
                      showTimeRange={showTimeRange}
                      showSubInfo={showSubInfo}
                      showSignatures={showSignatures}
                      showStats={showStats}
                      colorMode={colorMode}
                      customHeader={customHeader}
                      customFooter={customFooter}
                      paperSize={paperSize}
                      orientation={orientation}
                      isInteractivePreview
                    />
                  </div>
                ) : (
                  <div className="text-center text-xs text-slate-500">
                    请在左侧列表中选择或勾选要打印的课表
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── 隐藏的真实批量打印 DOM 容器（仅在 window.print() 时由 @media print 显示） ── */}
      <div id="printable-batch-area" className="hidden">
        {sheetsToPrint.map((sheet, idx) => (
          <PrintableTimetableSheet
            key={`${sheet.viewType}-${sheet.targetId}-${idx}`}
            sheet={sheet}
            schoolName={schoolName}
            semesterName={semesterName}
            versionName={versionName}
            showTimeRange={showTimeRange}
            showSubInfo={showSubInfo}
            showSignatures={showSignatures}
            showStats={showStats}
            colorMode={colorMode}
            customHeader={customHeader}
            customFooter={customFooter}
            paperSize={paperSize}
            orientation={orientation}
          />
        ))}
      </div>
    </>
  )
}
