import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@renderer/lib/utils'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/stores/toastStore'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { useMetaStore } from '@renderer/stores/metaStore'
import type {
  FixedLesson,
  Lesson,
  ScheduleVersion,
  TimeSlot,
  Subject,
  Teacher
} from '@shared/types/entities'
import {
  AdjustmentHistory,
  createAdjustmentCommand,
  detectAdjustmentConflicts,
  detectSwapConflicts,
  validAdjustmentTargets,
  type AdjustmentLesson,
  type AdjustmentProposal
} from '@shared/adjustments'
import { Button } from '@renderer/components/ui/button'
import {
  buildEntityGrid,
  buildSlotAxis,
  teacherGapSlots,
  type GridLesson,
  type TTView
} from './timetableModel'
import { buildAdjustmentRows } from './timetableAdjustmentModel'
import { SwapSuggestPanel } from '@renderer/components/timetable/SwapSuggestPanel'
import { TimetableGrid } from '@renderer/components/timetable/TimetableGrid'
import { OverviewSheet } from '@renderer/components/timetable/OverviewSheet'
import { ExportDialog } from '@renderer/components/timetable/ExportDialog'
import { PosterExportModal } from '@renderer/components/timetable/PosterExportModal'

/**
 * 课表页（M4 · docs/05 §4.5 + docs/mockups/timetable.html / overview.html 定稿）。
 * 班级 / 教师 / 教室 / 全校总表四个视图；学科配色取自学科库 color；
 * 预排无学科占位（升旗、早读、晚自习、班会）叠加显示为灰块。
 * M6 支持拖拽与单击两种调课方式，共用冲突检测、持久化与撤销/重做。
 */
const VIEW_TABS: { key: TTView; label: string }[] = [
  { key: 'class', label: '班级课表' },
  { key: 'teacher', label: '教师课表' },
  { key: 'room', label: '教室课表' },
  { key: 'overview', label: '全校总表' }
]

export function TimetablePage(): React.JSX.Element {
  const [searchParams] = useSearchParams()
  const { currentSemester, loaded, load } = useSchoolStore()
  const meta = useMetaStore()
  const semesterId = currentSemester?.id ?? null

  const [versions, setVersions] = useState<ScheduleVersion[]>([])
  const [versionId, setVersionId] = useState<number | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [fixed, setFixed] = useState<FixedLesson[]>([])
  const [loadingData, setLoadingData] = useState(false)

  const [view, setView] = useState<TTView>('class')
  const [stageId, setStageId] = useState<number | null>(null)
  const [targetId, setTargetId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GridLesson | null>(null)
  const [draggingLesson, setDraggingLesson] = useState<GridLesson | null>(null)
  const [clickAdjustmentLesson, setClickAdjustmentLesson] = useState<GridLesson | null>(null)
  const [adjustmentSaving, setAdjustmentSaving] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [posterModalOpen, setPosterModalOpen] = useState(false)
  const history = useRef(new AdjustmentHistory(50))
  const currentVersionId = useRef<number | null>(null)
  currentVersionId.current = versionId
  const pendingRelatedJump = useRef<{
    view: 'class' | 'teacher'
    targetId: number
    stageId: number | null
  } | null>(null)

  // 处理来自其他页面（如体检报告、导出中心、开始排课）的 URL 跳转参数
  useEffect(() => {
    const vIdStr = searchParams.get('versionId')
    const vView = searchParams.get('view') as TTView | null
    const tIdStr = searchParams.get('targetId')
    const sIdStr = searchParams.get('stageId')

    if (vIdStr && !isNaN(Number(vIdStr))) {
      setVersionId(Number(vIdStr))
    }
    if (vView && ['class', 'teacher', 'room', 'overview'].includes(vView)) {
      setView(vView)
    }
    if (tIdStr && !isNaN(Number(tIdStr))) {
      setTargetId(Number(tIdStr))
    }
    if (sIdStr && !isNaN(Number(sIdStr))) {
      setStageId(Number(sIdStr))
    }
  }, [searchParams])
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  useEffect(() => {
    if (semesterId != null) void meta.load(semesterId)
  }, [semesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 版本列表 + 预排占位（学期切换时重拉）
  useEffect(() => {
    if (semesterId == null) return
    let alive = true
    setVersions([])
    setVersionId(null)
    setLessons([])
    api['schedule:listVersions'](semesterId)
      .then((rows) => {
        if (!alive) return
        const sorted = [...rows].sort((a, b) => b.id - a.id)
        setVersions(sorted)
        setVersionId(sorted[0]?.id ?? null)
      })
      .catch((e) => toast.error(`读取课表版本失败：${String(e)}`))
    api['fixedLesson:list'](semesterId)
      .then((rows) => alive && setFixed(rows))
      .catch(() => alive && setFixed([]))
    return () => {
      alive = false
    }
  }, [semesterId])

  // 版本切换后，旧版本的撤销栈与活动调课对象都不能带到新版本。
  useEffect(() => {
    history.current = new AdjustmentHistory(50)
    setSelected(null)
    setDraggingLesson(null)
    setClickAdjustmentLesson(null)
  }, [versionId])

  // 版本课表行
  useEffect(() => {
    if (versionId == null) {
      setLessons([])
      return
    }
    setLoadingData(true)
    let alive = true
    api['timetable:versionLessons'](versionId)
      .then((rows) => alive && setLessons(rows))
      .catch((e) => {
        if (alive) {
          toast.error(`读取课表数据失败：${String(e)}`)
          setLessons([])
        }
      })
      .finally(() => alive && setLoadingData(false))
    return () => {
      alive = false
    }
  }, [versionId])

  const version = versions.find((v) => v.id === versionId) ?? null

  // ── 学段 / 班级 / 实体候选 ──
  const gradeById = useMemo(() => new Map(meta.grades.map((g) => [g.id, g])), [meta.grades])
  const stageOfClass = useMemo(() => {
    const m = new Map<number, number>()
    for (const c of meta.classes) {
      const sid = gradeById.get(c.gradeId)?.stageId
      if (sid != null) m.set(c.id, sid)
    }
    return m
  }, [meta.classes, gradeById])

  /** 学段选择器候选：只列有班级的学段（都没有时退回全部，避免空列表） */
  const selectableStages = useMemo(() => {
    const used = new Set(stageOfClass.values())
    const withClasses = meta.stages.filter((s) => used.has(s.id))
    return withClasses.length > 0 ? withClasses : meta.stages
  }, [meta.stages, stageOfClass])

  const defaultStageId = selectableStages[0]?.id ?? null

  /** 有课的教师 / 在用的教室（默认实体优先挑有数据的，避免一进来是空表） */
  const busyTeacherIds = useMemo(
    () => new Set(lessons.map((l) => l.teacherId).filter((t) => t != null)),
    [lessons]
  )
  const busyRoomIds = useMemo(
    () => new Set(lessons.map((l) => l.classroomId).filter((r) => r != null)),
    [lessons]
  )

  /** 默认实体：第一个班级 / 第一个有课的教师 / 第一个在用的教室（数据异步到齐后由派生值兜底） */
  const defaultTargetId = useMemo(() => {
    if (view === 'class') return meta.classes[0]?.id ?? null
    if (view === 'teacher') {
      return (
        meta.teachers.find((t) => t.enabled && busyTeacherIds.has(t.id))?.id ??
        meta.teachers.find((t) => t.enabled)?.id ??
        null
      )
    }
    if (view === 'room') {
      return (
        meta.classrooms.find((r) => r.enabled && busyRoomIds.has(r.id))?.id ??
        meta.classrooms.find((r) => r.enabled)?.id ??
        null
      )
    }
    return null
  }, [view, meta.classes, meta.teachers, meta.classrooms, busyTeacherIds, busyRoomIds])

  const targetValid =
    targetId != null &&
    (view === 'class'
      ? meta.classes.some((c) => c.id === targetId)
      : view === 'teacher'
        ? meta.teachers.some((t) => t.id === targetId && t.enabled)
        : view === 'room'
          ? meta.classrooms.some((r) => r.id === targetId && r.enabled)
          : false)

  const resolvedTargetId = targetValid ? targetId : defaultTargetId

  /** 教师 / 教室视图的轴默认跟着其实际课表所在学段走，而不是学段列表第一项 */
  const stageByUsage = useMemo(() => {
    if (view !== 'teacher' && view !== 'room') return null
    if (resolvedTargetId == null || lessons.length === 0) return null
    const counts = new Map<number, number>()
    for (const l of lessons) {
      if (
        view === 'teacher' ? l.teacherId !== resolvedTargetId : l.classroomId !== resolvedTargetId
      )
        continue
      const sid = stageOfClass.get(l.classId)
      if (sid != null) counts.set(sid, (counts.get(sid) ?? 0) + 1)
    }
    let best: number | null = null
    let max = 0
    for (const [sid, n] of counts) {
      if (n > max) {
        max = n
        best = sid
      }
    }
    return best
  }, [view, resolvedTargetId, lessons, stageOfClass])

  const activeStageId = useMemo(() => {
    if (view === 'class') {
      if (resolvedTargetId != null) return stageOfClass.get(resolvedTargetId) ?? defaultStageId
      return defaultStageId
    }
    if (view === 'overview') return stageId ?? defaultStageId
    return stageId ?? stageByUsage ?? defaultStageId
  }, [view, resolvedTargetId, stageId, stageByUsage, stageOfClass, defaultStageId])

  const stageClasses = useMemo(
    () => meta.classes.filter((c) => stageOfClass.get(c.id) === activeStageId),
    [meta.classes, stageOfClass, activeStageId]
  )

  // URL 跳转或异步默认值变化也必须清理旧实体上的调课状态。
  useEffect(() => {
    setDraggingLesson(null)
    setClickAdjustmentLesson(null)
  }, [resolvedTargetId, activeStageId])

  // 视图切换：清掉手选实体 / 手选学段，回到派生默认
  useEffect(() => {
    const jump = pendingRelatedJump.current
    if (jump?.view === view) {
      setTargetId(jump.targetId)
      setStageId(jump.stageId)
      pendingRelatedJump.current = null
    } else {
      setTargetId(null)
      setStageId(null)
    }
    setSelected(null)
    setDraggingLesson(null)
    setClickAdjustmentLesson(null)
    setSearch('')
  }, [view])

  const openRelatedTimetable = (lesson: GridLesson): void => {
    if (view === 'class' && lesson.teacherId != null) {
      pendingRelatedJump.current = {
        view: 'teacher',
        targetId: lesson.teacherId,
        stageId: lesson.classId != null ? (stageOfClass.get(lesson.classId) ?? null) : null
      }
      setView('teacher')
      toast.info('已跳转到该教师课表')
    } else if (view === 'teacher' && lesson.classId != null) {
      pendingRelatedJump.current = {
        view: 'class',
        targetId: lesson.classId,
        stageId: stageOfClass.get(lesson.classId) ?? null
      }
      setView('class')
      toast.info('已跳转到该班级课表')
    }
  }

  const axis = useMemo(
    () => (activeStageId != null ? buildSlotAxis(meta.slotsByStage[activeStageId] ?? []) : null),
    [meta.slotsByStage, activeStageId]
  )

  const grid = useMemo(
    () =>
      view !== 'overview' && axis && resolvedTargetId != null && lessons.length + fixed.length > 0
        ? buildEntityGrid(view, resolvedTargetId, lessons, fixed, axis, meta)
        : null,
    [axis, resolvedTargetId, view, lessons, fixed, meta]
  )

  const gaps = useMemo(
    () => (grid && view === 'teacher' && axis ? teacherGapSlots(grid, axis) : null),
    [grid, view, axis]
  )

  const adjustmentRows = useMemo(
    () => buildAdjustmentRows(lessons, fixed, meta.classes),
    [lessons, fixed, meta.classes]
  )
  const adjustmentLesson = draggingLesson ?? clickAdjustmentLesson

  /** 拖拽与单击调课共用同一套冲突口径和可落点高亮（含空位移入与双向对调）。 */
  const dropSlots = useMemo(() => {
    if (adjustmentLesson?.lessonId == null || axis == null) return null
    return validAdjustmentTargets(
      adjustmentRows,
      adjustmentLesson.lessonId,
      axis.rows.map((row) => row.slotId),
      { view, targetId: resolvedTargetId }
    )
  }, [adjustmentLesson, adjustmentRows, axis, view, resolvedTargetId])

  useEffect(() => {
    if (clickAdjustmentLesson == null) return
    const cancel = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setClickAdjustmentLesson(null)
      toast.info('已取消调课')
    }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [clickAdjustmentLesson])

  // ── 侧栏列表 ──
  const sidebar = useMemo(() => {
    const q = search.trim()
    if (view === 'class') {
      // 班级视图侧栏列全学校班级（按年级分组，跨学段），选谁就以谁的学段作息渲染
      const items = meta.classes.filter((c) => !q || c.name.includes(q))
      const groups = [...new Set(items.map((c) => c.gradeId))].map((gid) => ({
        key: `g${gid}`,
        label: gradeById.get(gid)?.name ?? '',
        items: items.filter((c) => c.gradeId === gid).map((c) => ({ id: c.id, label: c.name }))
      }))
      return groups
    }
    if (view === 'teacher') {
      const subjectById = new Map(meta.subjects.map((s) => [s.id, s]))
      const items = meta.teachers
        .filter((t) => t.enabled)
        .filter(
          (t) =>
            !q ||
            t.name.includes(q) ||
            t.subjectIds.some((sid) => subjectById.get(sid)?.name.includes(q))
        )
      const groups = new Map<string, { id: number; label: string }[]>()
      for (const t of items) {
        const names = t.subjectIds.map((sid) => subjectById.get(sid)?.name).filter(Boolean)
        const key = names.length > 0 ? names.join(' / ') : '未分科'
        const arr = groups.get(key) ?? []
        arr.push({ id: t.id, label: t.name })
        groups.set(key, arr)
      }
      return [...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'zh'))
        .map(([key, items]) => ({ key, label: key, items }))
    }
    if (view === 'room') {
      const items = meta.classrooms
        .filter((r) => r.enabled)
        .filter((r) => !q || r.name.includes(q) || (r.building ?? '').includes(q))
      const groups = new Map<string, { id: number; label: string }[]>()
      for (const r of items) {
        const key = r.building || '未分楼'
        const arr = groups.get(key) ?? []
        arr.push({ id: r.id, label: r.name })
        groups.set(key, arr)
      }
      return [...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'zh'))
        .map(([key, items]) => ({ key, label: key, items }))
    }
    return []
  }, [view, search, meta.classes, meta.teachers, meta.classrooms, meta.subjects, gradeById])

  const adjustmentLessons = (): AdjustmentLesson[] =>
    adjustmentRows.map((lesson) => ({ ...lesson }))

  const moveLesson = async (
    active: GridLesson | null,
    targetSlotId: number,
    targetLesson: GridLesson | null,
    mode: 'click' | 'drag'
  ): Promise<void> => {
    if (adjustmentSaving || versionId == null || active?.lessonId == null) return
    const source = lessons.find((lesson) => lesson.id === active.lessonId)
    if (source == null) {
      setClickAdjustmentLesson(null)
      setDraggingLesson(null)
      toast.error('找不到要调整的课程，请重新选择')
      return
    }

    // 点击/拖拽到自身当前位置 -> 取消调课
    if (
      source.slotId === targetSlotId &&
      (targetLesson == null || targetLesson.lessonId === source.id)
    ) {
      if (mode === 'click') {
        setClickAdjustmentLesson(null)
        toast.info('已取消单击调课')
      }
      return
    }

    // 确定目标是否有课程（对调 vs 移入）
    let swapTarget: Lesson | undefined = undefined
    if (
      targetLesson != null &&
      targetLesson.lessonId != null &&
      targetLesson.lessonId !== source.id
    ) {
      swapTarget = lessons.find((l) => l.id === targetLesson.lessonId)
    } else {
      // 若未直接传入 targetLesson（如从 slotClick 触发），按当前视图查找该 slot 上的已有课程
      if (view === 'class' && resolvedTargetId != null) {
        swapTarget = lessons.find(
          (l) => l.classId === resolvedTargetId && l.slotId === targetSlotId && l.id !== source.id
        )
      } else if (view === 'teacher' && resolvedTargetId != null) {
        swapTarget = lessons.find(
          (l) => l.teacherId === resolvedTargetId && l.slotId === targetSlotId && l.id !== source.id
        )
      } else if (view === 'room' && resolvedTargetId != null) {
        swapTarget = lessons.find(
          (l) =>
            l.classroomId === resolvedTargetId && l.slotId === targetSlotId && l.id !== source.id
        )
      }
    }

    if (swapTarget != null) {
      // 对调逻辑
      if (swapTarget.isLocked) {
        toast.error('目标课程属于预排锁定内容，不可对调')
        return
      }
      const conflicts = detectSwapConflicts(adjustmentRows, source.id, swapTarget.id)
      if (conflicts.length > 0) {
        const messages = [...new Set(conflicts.map((c) => c.message))]
        toast.error(`不可对调：${messages.join('；')}`)
        return
      }

      setAdjustmentSaving(true)
      try {
        await api['timetable:swapLessons']({
          versionId,
          lessonAId: source.id,
          lessonBId: swapTarget.id,
          reason: mode === 'click' ? '单击对调' : '拖拽对调'
        })
        if (currentVersionId.current !== versionId) return
        const proposal: AdjustmentProposal = {
          actionType: 'swap',
          lessonId: source.id,
          fromSlotId: source.slotId,
          toSlotId: targetSlotId,
          swapWithLessonId: swapTarget.id
        }
        const command = createAdjustmentCommand(proposal)
        history.current.execute(command, adjustmentLessons())
        const sourceSlot = source.slotId
        setLessons((prev) =>
          prev.map((l) => {
            if (l.id === source.id) return { ...l, slotId: targetSlotId }
            if (l.id === swapTarget!.id) return { ...l, slotId: sourceSlot }
            return l
          })
        )
        setSelected(null)
        setClickAdjustmentLesson(null)
        setDraggingLesson(null)
        toast.success(
          `已成功将「${active.subjectName}」与「${targetLesson?.subjectName ?? '目标课程'}」对调并保存`
        )
      } catch (error) {
        toast.error(`保存换课失败：${String(error)}`)
      } finally {
        setAdjustmentSaving(false)
      }
    } else {
      // 移入空位逻辑
      const proposal: AdjustmentProposal = {
        actionType: 'move',
        lessonId: source.id,
        fromSlotId: source.slotId,
        toSlotId: targetSlotId
      }
      const conflicts = detectAdjustmentConflicts(adjustmentRows, proposal)
      if (conflicts.length > 0) {
        const messages = [...new Set(conflicts.map((conflict) => conflict.message))]
        toast.error(`不可调入：${messages.join('；')}`)
        return
      }
      setAdjustmentSaving(true)
      try {
        await api['timetable:moveLesson']({
          versionId,
          lessonId: proposal.lessonId,
          toSlotId: proposal.toSlotId,
          reason: mode === 'click' ? '单击移入' : '拖拽移入'
        })
        if (currentVersionId.current !== versionId) return
        const command = createAdjustmentCommand(proposal)
        history.current.execute(command, adjustmentLessons())
        setLessons((previous) =>
          previous.map((lesson) =>
            lesson.id === proposal.lessonId ? { ...lesson, slotId: proposal.toSlotId } : lesson
          )
        )
        setSelected(null)
        setClickAdjustmentLesson(null)
        setDraggingLesson(null)
        toast.success('已成功移入空闲时段并保存')
      } catch (error) {
        toast.error(`保存换课失败：${String(error)}`)
      } finally {
        setAdjustmentSaving(false)
      }
    }
  }

  const handleLessonClick = (lesson: GridLesson): void => {
    if (adjustmentSaving) return
    if (clickAdjustmentLesson != null) {
      if (clickAdjustmentLesson.lessonId === lesson.lessonId) {
        setClickAdjustmentLesson(null)
        setSelected(null)
        toast.info('已取消调课')
      } else {
        void moveLesson(clickAdjustmentLesson, lesson.slotId, lesson, 'click')
      }
      return
    }
    setSelected(lesson)
    if (lesson.lessonId == null || lesson.locked || lesson.overlay) {
      toast.info('该课程属于预排锁定内容，不可调整')
      return
    }
    setClickAdjustmentLesson(lesson)
  }

  const handleDrop = (slotId: number): void => {
    void moveLesson(draggingLesson, slotId, null, 'drag')
  }

  const handleSlotClick = (slotId: number): void => {
    void moveLesson(clickAdjustmentLesson, slotId, null, 'click')
  }

  const handleUndo = async (): Promise<void> => {
    const command = history.current.nextUndo
    if (!command || versionId == null) return
    try {
      if (command.proposal.swapWithLessonId != null) {
        await api['timetable:swapLessons']({
          versionId,
          lessonAId: command.proposal.lessonId,
          lessonBId: command.proposal.swapWithLessonId,
          reason: '撤销对调'
        })
        const next = adjustmentLessons()
        history.current.undo(next)
        setLessons((previous) =>
          previous.map((lesson) => {
            if (lesson.id === command.proposal.lessonId)
              return { ...lesson, slotId: command.proposal.fromSlotId }
            if (lesson.id === command.proposal.swapWithLessonId)
              return { ...lesson, slotId: command.proposal.toSlotId }
            return lesson
          })
        )
      } else {
        await api['timetable:moveLesson']({
          versionId,
          lessonId: command.proposal.lessonId,
          toSlotId: command.proposal.fromSlotId,
          reason: '撤销移动'
        })
        const next = adjustmentLessons()
        history.current.undo(next)
        setLessons((previous) =>
          previous.map((lesson) =>
            lesson.id === command.proposal.lessonId
              ? { ...lesson, slotId: command.proposal.fromSlotId }
              : lesson
          )
        )
      }
      setClickAdjustmentLesson(null)
      setDraggingLesson(null)
      toast.success('已撤销上一步操作并保存')
    } catch (error) {
      toast.error(`撤销保存失败：${String(error)}`)
    }
  }

  const handleRedo = async (): Promise<void> => {
    const command = history.current.nextRedo
    if (!command || versionId == null) return
    try {
      if (command.proposal.swapWithLessonId != null) {
        await api['timetable:swapLessons']({
          versionId,
          lessonAId: command.proposal.lessonId,
          lessonBId: command.proposal.swapWithLessonId,
          reason: '重做对调'
        })
        const next = adjustmentLessons()
        history.current.redo(next)
        setLessons((previous) =>
          previous.map((lesson) => {
            if (lesson.id === command.proposal.lessonId)
              return { ...lesson, slotId: command.proposal.toSlotId }
            if (lesson.id === command.proposal.swapWithLessonId)
              return { ...lesson, slotId: command.proposal.fromSlotId }
            return lesson
          })
        )
      } else {
        await api['timetable:moveLesson']({
          versionId,
          lessonId: command.proposal.lessonId,
          toSlotId: command.proposal.toSlotId,
          reason: '重做移动'
        })
        const next = adjustmentLessons()
        history.current.redo(next)
        setLessons((previous) =>
          previous.map((lesson) =>
            lesson.id === command.proposal.lessonId
              ? { ...lesson, slotId: command.proposal.toSlotId }
              : lesson
          )
        )
      }
      setClickAdjustmentLesson(null)
      setDraggingLesson(null)
      toast.success('已重做上一步操作并保存')
    } catch (error) {
      toast.error(`重做保存失败：${String(error)}`)
    }
  }

  const handleApplySuggestion = async (
    targetSlotId: number,
    swapWithLessonId?: number
  ): Promise<void> => {
    if (!selected || selected.lessonId == null || versionId == null) return
    const sourceLessonId = selected.lessonId
    const sourceSlotId = selected.slotId

    if (swapWithLessonId != null) {
      const proposal: AdjustmentProposal = {
        actionType: 'swap',
        lessonId: sourceLessonId,
        fromSlotId: sourceSlotId,
        toSlotId: targetSlotId,
        swapWithLessonId
      }
      const conflicts = detectSwapConflicts(adjustmentRows, sourceLessonId, swapWithLessonId)
      if (conflicts.length > 0) {
        toast.error(conflicts.map((c) => c.message).join('；'))
        return
      }

      try {
        await api['timetable:swapLessons']({
          versionId,
          lessonAId: sourceLessonId,
          lessonBId: swapWithLessonId,
          reason: '智能换课建议对调'
        })
        const cmd = createAdjustmentCommand(proposal)
        history.current.execute(cmd, adjustmentLessons())
        setLessons((prev) =>
          prev.map((l) => {
            if (l.id === sourceLessonId) return { ...l, slotId: targetSlotId }
            if (l.id === swapWithLessonId) return { ...l, slotId: sourceSlotId }
            return l
          })
        )
        toast.success('已成功对调两门课程并保存')
        setSelected(null)
        setClickAdjustmentLesson(null)
      } catch (err) {
        toast.error(`对调课程失败：${String(err)}`)
      }
    } else {
      const proposal: AdjustmentProposal = {
        actionType: 'move',
        lessonId: sourceLessonId,
        fromSlotId: sourceSlotId,
        toSlotId: targetSlotId
      }
      const conflicts = detectAdjustmentConflicts(adjustmentRows, proposal)
      if (conflicts.length > 0) {
        toast.error(conflicts.map((conflict) => conflict.message).join('；'))
        return
      }
      try {
        await api['timetable:moveLesson']({
          versionId: versionId!,
          lessonId: proposal.lessonId,
          toSlotId: proposal.toSlotId,
          reason: '智能调课建议移入'
        })
        const command = createAdjustmentCommand(proposal)
        const next = adjustmentLessons()
        history.current.execute(command, next)
        setLessons((previous) =>
          previous.map((lesson) =>
            lesson.id === proposal.lessonId ? { ...lesson, slotId: proposal.toSlotId } : lesson
          )
        )
        toast.success('已成功移入空闲时段并保存')
        setSelected(null)
        setClickAdjustmentLesson(null)
      } catch (error) {
        toast.error(`移入失败：${String(error)}`)
      }
    }
  }

  if (semesterId == null) {
    return (
      <div className="mx-auto max-w-xl rounded-card border border-dashed border-[color:var(--border-subtle)] p-10 text-center text-sm text-[color:var(--text-secondary)]">
        请先到「学校设置」创建并选择当前学期，再来查看课表。
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader semester={currentSemester?.name ?? ''} />
        <div className="mx-auto mt-16 max-w-md rounded-card border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--panel)] p-10 text-center">
          <div className="text-4xl">🗓️</div>
          <h2 className="mt-4 text-lg font-semibold">还没有排课结果</h2>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
            先到「开始排课」跑一次排课，生成的版本会出现在这里。
          </p>
          <Button className="mt-6 h-11" onClick={() => (window.location.hash = '#/scheduling')}>
            去排课
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        semester={currentSemester?.name ?? ''}
        version={version}
        versions={versions}
        onVersion={setVersionId}
      />

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-btn border border-[color:var(--border-subtle)] bg-[color:var(--panel)] p-0.5">
          {VIEW_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(t.key)}
              className={cn(
                'rounded-[7px] px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150',
                view === t.key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-[color:var(--text-2)] hover:text-[color:var(--text)]'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {view !== 'class' && selectableStages.length > 1 && (
          <Select
            value={activeStageId ?? undefined}
            onChange={(v) => {
              setStageId(+v)
              setSelected(null)
              setDraggingLesson(null)
              setClickAdjustmentLesson(null)
            }}
            options={selectableStages.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}

        {/* 调课模式提示：紧凑内嵌于工具栏，绝不新增全宽块挤压表格垂直高度 */}
        {clickAdjustmentLesson && (
          <div className="flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-900 animate-in fade-in dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <span className="font-semibold">调课中:</span>
            <span className="max-w-[180px] truncate">
              已选「{clickAdjustmentLesson.subjectName}」
            </span>
            <span className="hidden text-emerald-700 dark:text-emerald-300 xl:inline">
              （绿色格可调入/对调）
            </span>
            <button
              type="button"
              className="ml-1 rounded px-1.5 py-0.5 font-medium hover:bg-emerald-200/60 dark:hover:bg-emerald-500/30"
              onClick={() => {
                setClickAdjustmentLesson(null)
                toast.info('已取消调课')
              }}
            >
              取消(Esc)
            </button>
          </div>
        )}

        <div className="flex-1" />

        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium',
            version && version.hardViolations === 0
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
              : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
          )}
          title="硬约束违反（M5 体检报告出细项）"
        >
          硬约束 {version?.hardViolations ?? '—'}
        </span>
        <Button
          size="sm"
          disabled={!history.current.canUndo}
          onClick={handleUndo}
          title="撤销最近一次本地调整"
        >
          ↶ 撤销
        </Button>
        <Button
          size="sm"
          disabled={!history.current.canRedo}
          onClick={handleRedo}
          title="重做最近一次本地调整"
        >
          ↷ 重做
        </Button>
        <Button
          size="sm"
          onClick={() => setExportDialogOpen(true)}
          disabled={versionId == null}
          title="导出课表 (Excel / A4排版)"
        >
          ↥ 导出
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPosterModalOpen(true)}
          disabled={versionId == null}
          className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
          title="生成 300 DPI 超高清海报图，供广告公司大幅面喷绘张贴"
        >
          🖼️ 大幅海报
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.print()}
          disabled={versionId == null}
          title="打印当前课表 (A4 打印预览)"
        >
          🖨️ 打印
        </Button>
      </div>

      {/* 主体三栏 */}
      <div className="flex min-h-0 flex-1 gap-3">
        {view !== 'overview' && (
          <aside className="flex w-44 shrink-0 flex-col rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--panel)]">
            <div className="border-b border-[color:var(--border-subtle)] p-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  view === 'class'
                    ? '搜索班级…'
                    : view === 'teacher'
                      ? '搜索教师 / 学科…'
                      : '搜索教室…'
                }
                className="w-full rounded-input border border-[color:var(--border-subtle)] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-brand-600"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {sidebar.length === 0 && (
                <p className="p-3 text-center text-xs text-[color:var(--text-3)]">
                  {search.trim() ? '无匹配结果' : '本学期还没有数据'}
                </p>
              )}
              {sidebar.map((g) => (
                <div key={g.key} className="mb-2">
                  <p className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--text-3)]">
                    {g.label}
                  </p>
                  {g.items.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        setTargetId(it.id)
                        setStageId(null)
                        setSelected(null)
                        setDraggingLesson(null)
                        setClickAdjustmentLesson(null)
                      }}
                      className={cn(
                        'relative block w-full rounded-[7px] px-2 py-1.5 text-left text-[13px] transition-colors duration-150',
                        resolvedTargetId === it.id
                          ? 'bg-brand-50 pr-2 font-medium text-brand-700 dark:bg-brand-600/15 dark:text-brand-50'
                          : 'text-[color:var(--text-2)] hover:bg-[color:var(--panel-2)] hover:text-[color:var(--text)]'
                      )}
                    >
                      {resolvedTargetId === it.id && (
                        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-brand-600" />
                      )}
                      <span className="pl-2">{it.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </aside>
        )}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--panel)]">
          {view === 'overview' ? (
            stageClasses.length > 0 ? (
              <div className="flex min-h-0 flex-1 flex-col p-3">
                <OverviewSheet
                  classes={stageClasses}
                  grades={meta.grades.filter((g) => g.stageId === activeStageId)}
                  lessons={lessons}
                  fixed={fixed}
                  slots={meta.slotsByStage[activeStageId ?? -1] ?? []}
                  subjects={meta.subjects}
                  teachers={meta.teachers}
                  classrooms={meta.classrooms}
                  hardViolations={version?.hardViolations ?? 0}
                  onExport={() => setExportDialogOpen(true)}
                />
              </div>
            ) : (
              <div className="grid flex-1 place-items-center text-sm text-[color:var(--text-3)]">
                该学段暂无班级
              </div>
            )
          ) : (
            <>
              <GridHeader
                view={view}
                targetId={resolvedTargetId}
                grid={grid}
                axis={axis}
                gaps={gaps}
                loading={loadingData}
              />
              <div className="min-h-0 flex-1 overflow-auto p-4 pt-2" key={versionId ?? 'v'}>
                {axis && grid ? (
                  <TimetableGrid
                    axis={axis}
                    grid={grid}
                    view={view}
                    gapSlots={gaps?.gaps ?? new Set<number>()}
                    selected={selected}
                    onSelect={handleLessonClick}
                    adjustmentLesson={adjustmentLesson}
                    dropSlots={dropSlots}
                    onDragStart={(lesson) => {
                      if (lesson.lessonId == null || lesson.locked || adjustmentSaving) return
                      setClickAdjustmentLesson(null)
                      setDraggingLesson(lesson)
                    }}
                    onDragEnd={() => setDraggingLesson(null)}
                    onOpenRelated={(lesson) => {
                      setClickAdjustmentLesson(null)
                      openRelatedTimetable(lesson)
                    }}
                    onDrop={handleDrop}
                    onSlotClick={handleSlotClick}
                    waterfall
                  />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-[color:var(--text-3)]">
                    {loadingData ? '正在载入课表…' : '本学期还没有班级 / 教室数据'}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {view !== 'overview' && (
          <aside className="w-80 shrink-0 overflow-y-auto overflow-x-hidden">
            <StatsPanel
              view={view}
              lessons={lessons}
              grid={grid}
              axis={axis}
              targetId={resolvedTargetId}
              gaps={gaps}
              selectedLesson={clickAdjustmentLesson ?? selected}
              slots={activeStageId ? (meta.slotsByStage[activeStageId] ?? []) : []}
              subjects={meta.subjects}
              teachers={meta.teachers}
              onApplySuggestion={handleApplySuggestion}
            />
          </aside>
        )}
      </div>

      {semesterId != null && (
        <ExportDialog
          open={exportDialogOpen}
          onClose={() => setExportDialogOpen(false)}
          semesterId={semesterId}
          versionId={versionId}
          versionName={version?.name}
          stageId={activeStageId}
          stageName={meta.stages.find((s) => s.id === activeStageId)?.name}
          view={view}
          targetId={resolvedTargetId}
          targetName={
            view === 'class'
              ? meta.classes.find((c) => c.id === resolvedTargetId)?.name
              : view === 'teacher'
                ? meta.teachers.find((t) => t.id === resolvedTargetId)?.name
                : view === 'room'
                  ? meta.classrooms.find((r) => r.id === resolvedTargetId)?.name
                  : meta.stages.find((s) => s.id === activeStageId)?.name
          }
        />
      )}

      {semesterId != null && (
        <PosterExportModal
          open={posterModalOpen}
          onClose={() => setPosterModalOpen(false)}
          semesterId={semesterId}
          versionId={versionId}
          stageId={activeStageId}
          stageName={meta.stages.find((s) => s.id === activeStageId)?.name}
          schoolName={currentSemester?.name ? '学校' : undefined}
          semesterName={currentSemester?.name}
          versionName={version?.name}
          classes={meta.classes}
          grades={meta.grades}
          slots={activeStageId ? (meta.slotsByStage[activeStageId] ?? []) : []}
          lessons={lessons}
          fixedLessons={fixed}
          subjects={meta.subjects}
          teachers={meta.teachers}
          classrooms={meta.classrooms}
        />
      )}
    </div>
  )
}

function PageHeader({
  semester,
  version,
  versions,
  onVersion
}: {
  semester: string
  version?: ScheduleVersion | null
  versions?: ScheduleVersion[]
  onVersion?: (id: number) => void
}): React.JSX.Element {
  version = version ?? null
  versions = versions ?? []
  onVersion = onVersion ?? (() => {})
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">课表总览</h1>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          班级 / 教师 / 教室 / 全校总表 · {semester}
          {version?.solveMs != null && ` · 求解 ${version.solveMs}ms`}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
        版本
        <Select
          value={version?.id}
          onChange={(v) => onVersion(+v)}
          options={versions.map((v) => ({ value: v.id, label: v.name }))}
        />
      </label>
    </div>
  )
}

function Select({
  value,
  onChange,
  options
}: {
  value: number | undefined
  onChange: (v: string) => void
  options: { value: number; label: string }[]
}): React.JSX.Element {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-input border border-[color:var(--border-subtle)] bg-[color:var(--panel)] px-2 py-1.5 text-[13px] text-[color:var(--text)] outline-none focus:border-brand-600"
    >
      {options.length === 0 && <option value="">（无）</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function GridHeader({
  view,
  targetId,
  grid,
  axis,
  gaps,
  loading
}: {
  view: TTView
  targetId: number | null
  grid: ReturnType<typeof buildEntityGrid> | null
  axis: ReturnType<typeof buildSlotAxis> | null
  gaps: ReturnType<typeof teacherGapSlots> | null
  loading: boolean
}): React.JSX.Element {
  const meta = useMetaStore()
  const onAxisSlot = new Set((axis?.rows ?? []).map((r) => r.slotId))
  if (targetId == null)
    return <div className="p-4 pb-0 text-sm text-[color:var(--text-3)]">未选择实体</div>
  const count = grid
    ? [...grid.lessonsBySlot.values()].flat().filter((b) => onAxisSlot.has(b.slotId)).length
    : 0
  const sub = loading ? '载入中…' : `本周 ${count} 节`
  let title = ''
  let detail = ''
  if (view === 'class') {
    const c = meta.classes.find((x) => x.id === targetId)
    const ht =
      c?.headTeacherId != null ? meta.teachers.find((t) => t.id === c.headTeacherId)?.name : null
    const room =
      c?.homeRoomId != null ? meta.classrooms.find((r) => r.id === c.homeRoomId)?.name : null
    title = c?.name ?? '班级'
    detail = `${ht ? `班主任 ${ht} · ` : ''}${c?.studentCount ?? 0} 人${room ? ` · ${room}` : ''}`
  } else if (view === 'teacher') {
    const t = meta.teachers.find((x) => x.id === targetId)
    const names = (t?.subjectIds ?? [])
      .map((sid) => meta.subjects.find((s) => s.id === sid)?.name)
      .filter(Boolean)
      .join(' / ')
    const gapCount = [...(gaps?.gaps ?? [])].length
    title = t?.name ?? '教师'
    detail = `${names || '未分科'} · 空隙 ${gapCount} 节`
  } else {
    const r = meta.classrooms.find((x) => x.id === targetId)
    title = r?.name ?? '教室'
    detail = `${r?.roomType ?? ''} · 容量 ${r?.capacity ?? 0}`
  }
  return (
    <div className="flex items-baseline gap-3 px-4 pb-1 pt-3">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <span className="text-xs text-[color:var(--text-3)]">{detail}</span>
      <span className="ml-auto text-xs font-medium text-brand-600 dark:text-brand-50">{sub}</span>
    </div>
  )
}

function StatsPanel({
  view,
  lessons,
  grid,
  axis,
  targetId,
  gaps,
  selectedLesson,
  slots,
  subjects,
  teachers,
  onApplySuggestion
}: {
  view: TTView
  lessons: Lesson[]
  grid: ReturnType<typeof buildEntityGrid> | null
  axis: ReturnType<typeof buildSlotAxis> | null
  targetId: number | null
  gaps: ReturnType<typeof teacherGapSlots> | null
  selectedLesson: GridLesson | null
  slots: TimeSlot[]
  subjects: Subject[]
  teachers: Teacher[]
  onApplySuggestion: (targetSlotId: number, swapWithLessonId?: number) => void
}): React.JSX.Element {
  const stats = useMemo(() => {
    if (!grid || targetId == null || !axis) return []
    // 只统计当前学段作息上的块（教师/教室可能跨学段任教使用）
    const onAxisSlot = new Set(axis.rows.map((r) => r.slotId))
    const blocks = [...grid.lessonsBySlot.values()].flat().filter((b) => onAxisSlot.has(b.slotId))
    const lessonBlocks = blocks.filter((b) => !b.overlay)
    const overlayBlocks = blocks.filter((b) => b.overlay)
    const groups = new Set(
      lessons
        .filter((l) =>
          view === 'class'
            ? l.classId === targetId
            : view === 'teacher'
              ? l.teacherId === targetId
              : l.classroomId === targetId
        )
        .map((l) => l.consecutiveGroup)
        .filter((g) => g != null)
    ).size
    const empty = axis.rows.filter(
      (r) => (grid.lessonsBySlot.get(r.slotId) ?? []).length === 0 && !grid.covered.has(r.slotId)
    ).length
    if (view === 'class') {
      return [
        { k: '周课时（含预排）', v: `${blocks.length} 节` },
        { k: '其中预排占位', v: `${overlayBlocks.length} 节` },
        { k: '连堂组', v: `${groups} 组` },
        { k: '锁定课', v: `${lessonBlocks.filter((b) => b.locked).length} 节` },
        { k: '空位', v: `${empty} 处` }
      ]
    }
    if (view === 'teacher') {
      const days = new Map<number, number>()
      for (const b of blocks) {
        const r = axis.rows.find((x) => x.slotId === b.slotId)
        if (r) days.set(r.day, (days.get(r.day) ?? 0) + 1)
      }
      const maxDay = Math.max(0, ...days.values())
      return [
        { k: '周课时', v: `${blocks.length} 节` },
        { k: '日均', v: `${(blocks.length / 5).toFixed(1)} 节` },
        { k: '最重一天', v: `${maxDay} 节` },
        { k: '空隙', v: `${gaps ? [...gaps.gaps].length : 0} 节` }
      ]
    }
    const roomLessons = lessons.filter(
      (l) => l.classroomId === targetId && onAxisSlot.has(l.slotId)
    )
    const classCount = new Set(roomLessons.map((l) => l.classId)).size
    const subjectCount = new Set(roomLessons.map((l) => l.subjectId)).size
    return [
      { k: '周占用', v: `${blocks.length} 节` },
      { k: '使用班级', v: `${classCount} 个` },
      { k: '涉及学科', v: `${subjectCount} 个` },
      { k: '空闲教学位', v: `${axis.rows.length - blocks.length} 个` }
    ]
  }, [grid, lessons, view, targetId, axis, gaps])

  const hint = useMemo(() => {
    if (view !== 'teacher') return null
    const byDay = gaps?.byDay
    if (!byDay || byDay.size === 0) return null
    const names = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
    return [...byDay.entries()].map(([d, n]) => `${names[d]} ${n}`).join(' · ')
  }, [view, gaps])

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--panel)] p-4">
        <h3 className="text-[13px] font-semibold">课时统计</h3>
        <p className="mt-0.5 text-[11px] text-[color:var(--text-3)]">
          本{view === 'class' ? '班' : view === 'teacher' ? '教师' : '教室'} · 当前版本
        </p>
        <div className="mt-3 flex flex-col gap-2.5">
          {stats.length === 0 && <p className="text-xs text-[color:var(--text-3)]">—</p>}
          {stats.map((s) => (
            <div key={s.k} className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-[color:var(--text-2)]">{s.k}</span>
              <b className="text-[13px] font-semibold tabular-nums">{s.v}</b>
            </div>
          ))}
        </div>
      </div>
      {hint && (
        <div className="rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--panel)] p-4">
          <h3 className="text-[13px] font-semibold">今日空隙</h3>
          <p className="mt-2 text-xs leading-5 text-[color:var(--text-2)]">{hint}</p>
          <p className="mt-2 text-[11px] leading-4 text-[color:var(--text-3)]">
            空隙 = 首末节课之间空着的教学节次（斜纹格）。
          </p>
        </div>
      )}
      <SwapSuggestPanel
        selectedLesson={selectedLesson}
        lessons={lessons}
        slots={slots}
        subjects={subjects}
        teachers={teachers}
        onApplySuggestion={onApplySuggestion}
      />
    </div>
  )
}
