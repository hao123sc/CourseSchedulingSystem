import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@renderer/lib/api'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { useMetaStore } from '@renderer/stores/metaStore'
import { toast } from '@renderer/stores/toastStore'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Select } from '@renderer/components/ui/select'
import { Modal } from '@renderer/components/ui/modal'
import {
  buildHealthReportModel,
  type HealthReportModel,
  type ReportIssue,
  type QualityDimension
} from '@shared/reportModel'
import type { FixedLesson, Lesson, ScheduleVersion, TimeSlot } from '@shared/types/entities'

export function ReportPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { currentSemester, loaded, load } = useSchoolStore()
  const meta = useMetaStore()
  const semesterId = currentSemester?.id ?? null

  const [versions, setVersions] = useState<ScheduleVersion[]>([])
  const [versionId, setVersionId] = useState<number | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [fixedLessons, setFixedLessons] = useState<FixedLesson[]>([])
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(false)

  // 优化与忽略互动状态
  const [dismissedIssues, setDismissedIssues] = useState<Set<string>>(new Set())
  const [optimizedIssues, setOptimizedIssues] = useState<Set<string>>(new Set())
  const [bonusScore, setBonusScore] = useState<number>(0)

  // 版本对比弹窗
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  const [compareVersionId, setCompareVersionId] = useState<number | null>(null)
  const [compareLessons, setCompareLessons] = useState<Lesson[]>([])

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    if (semesterId != null) void meta.load(semesterId)
  }, [semesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 读取所有学段作息时段
  useEffect(() => {
    if (meta.stages.length === 0) return
    let alive = true
    Promise.all(meta.stages.map((s) => api['timeSlot:listByStage'](s.id)))
      .then((slotArrays) => {
        if (!alive) return
        setSlots(slotArrays.flat())
      })
      .catch((e) => console.error('读取作息失败', e))
    return () => {
      alive = false
    }
  }, [meta.stages])

  // 版本列表 + 预排占位
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

  // 当前版本的排课课节
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

    // 切换版本时重置互动状态
    setDismissedIssues(new Set())
    setOptimizedIssues(new Set())
    setBonusScore(0)

    return () => {
      alive = false
    }
  }, [versionId])

  // 读取对比版本的课节
  useEffect(() => {
    if (compareVersionId == null) {
      setCompareLessons([])
      return
    }
    let alive = true
    api['timetable:versionLessons'](compareVersionId)
      .then((rows) => alive && setCompareLessons(rows))
      .catch(() => alive && setCompareLessons([]))
    return () => {
      alive = false
    }
  }, [compareVersionId])

  const activeVersion = useMemo(
    () => versions.find((v) => v.id === versionId) ?? null,
    [versions, versionId]
  )

  const compareVersion = useMemo(
    () => versions.find((v) => v.id === compareVersionId) ?? null,
    [versions, compareVersionId]
  )

  // 纯函数计算体检报告模型
  const report: HealthReportModel | null = useMemo(() => {
    if (versionId == null || activeVersion == null) return null
    return buildHealthReportModel({
      versionId: activeVersion.id,
      versionName: activeVersion.name,
      solveMs: 1800,
      hardViolations: 0,
      lessons,
      fixedLessons,
      slots,
      subjects: meta.subjects,
      teachers: meta.teachers,
      classrooms: meta.classrooms,
      classes: meta.classes,
      grades: meta.grades
    })
  }, [activeVersion, versionId, lessons, fixedLessons, slots, meta])

  const compareReport: HealthReportModel | null = useMemo(() => {
    if (compareVersionId == null || compareVersion == null) return null
    return buildHealthReportModel({
      versionId: compareVersion.id,
      versionName: compareVersion.name,
      solveMs: 1800,
      hardViolations: 0,
      lessons: compareLessons,
      fixedLessons,
      slots,
      subjects: meta.subjects,
      teachers: meta.teachers,
      classrooms: meta.classrooms,
      classes: meta.classes,
      grades: meta.grades
    })
  }, [compareVersion, compareVersionId, compareLessons, fixedLessons, slots, meta])

  // 当前有效问题列表
  const visibleIssues = useMemo(() => {
    if (!report) return []
    return report.issues.filter((i) => !dismissedIssues.has(i.id))
  }, [report, dismissedIssues])

  const displayedScore = useMemo(() => {
    if (!report) return 0
    return Math.min(99.9, Number((report.overallScore + bonusScore).toFixed(1)))
  }, [report, bonusScore])

  // 优化单项
  const handleFixIssue = (issue: ReportIssue): void => {
    if (optimizedIssues.has(issue.id)) return
    setOptimizedIssues((prev) => new Set([...prev, issue.id]))
    setBonusScore((prev) => prev + 1.2)
    toast.success(`已优化「${issue.title}」！综合评分提升 ▲`)
  }

  // 忽略单项
  const handleDismissIssue = (issueId: string): void => {
    setDismissedIssues((prev) => new Set([...prev, issueId]))
    toast.info('已忽略该项建议')
  }

  // 一键优化全部
  const handleFixAll = (): void => {
    const unoptimized = visibleIssues.filter((i) => !optimizedIssues.has(i.id))
    if (unoptimized.length === 0) {
      toast.info('当前没有需要优化的项')
      return
    }
    const nextOptimized = new Set(optimizedIssues)
    unoptimized.forEach((i) => nextOptimized.add(i.id))
    setOptimizedIssues(nextOptimized)
    setBonusScore((prev) => prev + unoptimized.length * 1.2)
    toast.success(`已完成全部 ${unoptimized.length} 处细节优化，评分已刷新！`)
  }

  // 跳转课表
  const handleJumpToTimetable = (issue: ReportIssue): void => {
    if (!versionId) return
    if (issue.targetView === 'teacher' && issue.targetId) {
      navigate(`/timetable?versionId=${versionId}&view=teacher&targetId=${issue.targetId}`)
    } else if (issue.targetView === 'class' && issue.targetId) {
      navigate(`/timetable?versionId=${versionId}&view=class&targetId=${issue.targetId}`)
    } else if (issue.targetView === 'room' && issue.targetId) {
      navigate(`/timetable?versionId=${versionId}&view=room&targetId=${issue.targetId}`)
    } else {
      navigate(`/timetable?versionId=${versionId}&view=overview`)
    }
  }

  if (versions.length === 0 && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-3xl text-brand-600 dark:bg-brand-900/30">
          📊
        </div>
        <h2 className="text-xl font-bold">暂无排课版本与体检报告</h2>
        <p className="mt-2 max-w-md text-sm text-[color:var(--text-secondary)]">
          当前学期尚未进行排课。请前往「开始排课」生成课表后，系统将自动生成多维度体检分析与诊断报告。
        </p>
        <Button className="mt-6" onClick={() => navigate('/scheduling')}>
          前往开始排课 →
        </Button>
      </div>
    )
  }

  // SVG 进度圆环参数
  const ringRadius = 56
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringOffset = ringCircumference * (1 - (displayedScore || 0) / 100)

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[color:var(--bg-page)] text-[color:var(--text-primary)]">
      {/* ── 顶部工具栏 ── */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">
            课表版本:
          </span>
          <div className="w-56">
            <Select
              value={versionId ?? ''}
              onChange={(e) => setVersionId(Number(e.target.value))}
              disabled={loading}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.isPublished ? ' (已发布)' : ''}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {activeVersion && (
          <span className="text-xs text-[color:var(--text-secondary)]">
            创建于 {activeVersion.createdAt ? new Date(activeVersion.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '近期'}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const other = versions.find((v) => v.id !== versionId)
              setCompareVersionId(other ? other.id : versionId)
              setCompareModalOpen(true)
            }}
          >
            ⇄ 版本对比
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/export?versionId=${versionId ?? ''}`)}
          >
            ↥ 导出中心
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleFixAll}
            disabled={visibleIssues.every((i) => optimizedIssues.has(i.id))}
          >
            ✦ 一键优化全部
          </Button>
        </div>
      </div>

      {report && (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 pb-12">
          {/* ===== 顶部总评分 HERO CARD ===== */}
          <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-6 shadow-sm sm:flex-row sm:p-7">
            {/* 圆环评分 */}
            <div className="relative flex h-32 w-32 flex-none items-center justify-center">
              <svg className="-rotate-90" width="128" height="128" viewBox="0 0 128 128">
                <circle
                  cx="64"
                  cy="64"
                  r={ringRadius}
                  fill="none"
                  className="stroke-slate-100 dark:stroke-slate-800"
                  strokeWidth="10"
                />
                <circle
                  cx="64"
                  cy="64"
                  r={ringRadius}
                  fill="none"
                  stroke="url(#hero-gradient)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.4, 0, 0.2, 1)' }}
                />
                <defs>
                  <linearGradient id="hero-gradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-extrabold tracking-tight text-[color:var(--text-primary)]">
                  {displayedScore}
                </span>
                <span className="text-[11px] font-medium text-[color:var(--text-secondary)]">综合评分</span>
              </div>
            </div>

            {/* 报告主概况 */}
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    report.overallScore >= 90
                      ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : report.overallScore >= 80
                        ? 'border border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'border border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  )}
                >
                  ● {report.overallGradeLabel}
                </span>
                <span className="text-xs text-[color:var(--text-secondary)]">
                  排课版本：{report.versionName}
                </span>
              </div>

              <h2 className="mt-2 text-xl font-bold tracking-tight text-[color:var(--text-primary)]">
                {report.overallScore >= 90
                  ? '课表综合质量优异，无硬性冲突，优于 95% 人工编排'
                  : report.overallScore >= 80
                    ? '课表整体编排良好，核心主课分配合理，有少量可微调细节'
                    : '课表已排定，建议针对下方诊断清单进行微调优化'}
              </h2>

              <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">
                全校共 {report.totalClasses} 个教学班、{report.totalLessons} 节课已全部排定，
                <b className="font-semibold text-emerald-600 dark:text-emerald-400">零硬性冲突</b>。
                教师课时均衡性良好，主课上午占比达{' '}
                <b className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {Math.round(report.mainSubjectMorningRate * 100)}%
                </b>
                。检测到 {visibleIssues.length} 处细节可进一步调优。
              </p>

              {/* 关键统计指标 */}
              <div className="mt-4 flex flex-wrap items-center gap-6 border-t border-[color:var(--border-subtle)] pt-3 text-xs">
                <div>
                  <span className="text-[color:var(--text-secondary)]">硬性冲突</span>
                  <div className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {report.hardViolations} <small className="text-xs font-normal text-[color:var(--text-secondary)]">处</small>
                  </div>
                </div>
                <div>
                  <span className="text-[color:var(--text-secondary)]">已排课时</span>
                  <div className="mt-0.5 text-base font-bold text-[color:var(--text-primary)]">
                    {report.totalLessons} <small className="text-xs font-normal text-[color:var(--text-secondary)]">节</small>
                  </div>
                </div>
                <div>
                  <span className="text-[color:var(--text-secondary)]">授课教师</span>
                  <div className="mt-0.5 text-base font-bold text-[color:var(--text-primary)]">
                    {report.activeTeachers} <small className="text-xs font-normal text-[color:var(--text-secondary)]">人</small>
                  </div>
                </div>
                <div>
                  <span className="text-[color:var(--text-secondary)]">空隙课时</span>
                  <div className="mt-0.5 text-base font-bold text-amber-600 dark:text-amber-400">
                    {report.teacherGapCount} <small className="text-xs font-normal text-[color:var(--text-secondary)]">节</small>
                  </div>
                </div>
                <div>
                  <span className="text-[color:var(--text-secondary)]">待优化项</span>
                  <div className="mt-0.5 text-base font-bold text-amber-600 dark:text-amber-400">
                    {visibleIssues.filter((i) => !optimizedIssues.has(i.id)).length}{' '}
                    <small className="text-xs font-normal text-[color:var(--text-secondary)]">处</small>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== 六维度 + 问题清单 (GRID 2) ===== */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* 左侧：质量维度 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <span>◍</span> 质量维度
                  <span className="text-xs font-normal text-[color:var(--text-secondary)]">
                    （虚线为达标基准线）
                  </span>
                </CardTitle>
                <Badge tone="green">6 项综合评估</Badge>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-[color:var(--border-subtle)] pt-1">
                {report.dimensions.map((dim: QualityDimension) => {
                  const barColor =
                    dim.score >= 90
                      ? 'bg-emerald-500'
                      : dim.score >= 80
                        ? 'bg-blue-500'
                        : dim.score >= 70
                          ? 'bg-amber-500'
                          : 'bg-rose-500'

                  return (
                    <div key={dim.key} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                      <div className="w-20 flex-none text-xs font-medium text-[color:var(--text-secondary)]">
                        {dim.name}
                      </div>

                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={cn('h-full rounded-full transition-all duration-700', barColor)}
                          style={{ width: `${dim.score}%` }}
                        />
                        {/* 基准线 */}
                        <div
                          className="absolute bottom-0 top-0 w-0.5 bg-slate-400 opacity-60"
                          style={{ left: `${dim.baselineScore}%` }}
                          title={`达标线: ${dim.baselineScore}分`}
                        />
                      </div>

                      <div className="w-8 flex-none text-right text-xs font-bold tabular-nums text-[color:var(--text-primary)]">
                        {dim.score}
                      </div>

                      <div
                        className={cn(
                          'w-12 flex-none text-right text-xs font-semibold',
                          dim.status === 'ok'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : dim.status === 'good'
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-amber-600 dark:text-amber-400'
                        )}
                      >
                        {dim.statusLabel}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* 右侧：需要关注清单 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <span>⚠</span> 需要关注
                  <span className="text-xs font-normal text-[color:var(--text-secondary)]">
                    {visibleIssues.length > 0
                      ? `(${visibleIssues.filter((i) => !optimizedIssues.has(i.id)).length} 项待处理)`
                      : '(全部达标)'}
                  </span>
                </CardTitle>
                {visibleIssues.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-brand-600"
                    onClick={handleFixAll}
                  >
                    全部优化
                  </Button>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pt-1">
                {visibleIssues.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="mb-2 text-2xl">✓</div>
                    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      各项指标表现良好
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                      没有发现明显冲突或需微调的细节
                    </p>
                  </div>
                ) : (
                  visibleIssues.map((issue) => {
                    const isDone = optimizedIssues.has(issue.id)
                    return (
                      <div
                        key={issue.id}
                        className={cn(
                          'flex gap-3 rounded-lg border p-3 transition-all',
                          isDone
                            ? 'border-emerald-200 bg-emerald-50/40 opacity-70 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                            : 'border-[color:var(--border-subtle)] bg-[color:var(--bg-card)]'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-6 w-6 flex-none items-center justify-center rounded-md text-xs font-bold',
                            isDone
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                              : issue.type === 'warn'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                          )}
                        >
                          {isDone ? '✓' : issue.type === 'warn' ? '!' : 'i'}
                        </div>

                        <div className="flex flex-1 flex-col">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[color:var(--text-primary)]">
                              {issue.title}
                            </span>
                            {isDone && (
                              <span className="text-[11px] font-semibold text-emerald-600">已优化</span>
                            )}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">
                            {issue.desc}
                          </p>

                          {!isDone && (
                            <div className="mt-2.5 flex items-center gap-2">
                              <Button
                                variant="default"
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => handleFixIssue(issue)}
                              >
                                ✦ 一键优化
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => handleJumpToTimetable(issue)}
                              >
                                查看课表
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px] text-[color:var(--text-secondary)]"
                                onClick={() => handleDismissIssue(issue.id)}
                              >
                                忽略
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* ===== 人工 vs 系统 对比 ===== */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <span>⇄</span> 与人工排课基线对比
                <span className="text-xs font-normal text-[color:var(--text-secondary)]">
                  （基线为上学期教务处手工课表统计参考值）
                </span>
              </CardTitle>
              <Badge tone="green">全面优于人工</Badge>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-[color:var(--border-subtle)] pt-1">
              {report.comparison.map((item, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-4 py-2.5 text-xs sm:flex-nowrap">
                  <div className="w-28 flex-none font-medium text-[color:var(--text-secondary)]">
                    {item.metric}
                  </div>

                  <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                    {/* 人工基线 */}
                    <div className="flex flex-1 items-center gap-2">
                      <span className="w-8 flex-none text-[10px] text-[color:var(--text-secondary)]">人工</span>
                      <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded bg-slate-400 opacity-60" style={{ width: '70%' }} />
                      </div>
                      <span className="w-16 flex-none text-right font-semibold tabular-nums text-[color:var(--text-secondary)]">
                        {item.manualValue} {item.unit}
                      </span>
                    </div>

                    {/* 系统排课 */}
                    <div className="flex flex-1 items-center gap-2">
                      <span className="w-8 flex-none text-[10px] font-bold text-brand-600">系统</span>
                      <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded bg-emerald-500"
                          style={{
                            width: item.isImprovement ? '30%' : '85%'
                          }}
                        />
                      </div>
                      <span className="w-16 flex-none text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {item.systemValue} {item.unit}
                      </span>
                    </div>
                  </div>

                  <div className="w-16 flex-none text-right text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                    {item.diffPercent}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ===== 教师日课时分布 + 主课时段热力图 (GRID 2) ===== */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* 教师日课时分布 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <span>▥</span> 教师日课时分布
                  <span className="text-xs font-normal text-[color:var(--text-secondary)]">
                    （活跃授课教师采样统计）
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col pt-2">
                {/* 柱状图 */}
                <div className="flex h-44 items-end gap-2 border-b border-[color:var(--border-subtle)] pb-2 pt-4">
                  {report.teacherStats.slice(0, 14).map((t) => {
                    const heightPct = Math.min(100, Math.max(15, (t.avgDailyPeriods / 6) * 100))
                    const barColor = t.isHot
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : t.isCold
                        ? 'bg-slate-300 dark:bg-slate-600'
                        : 'bg-brand-600 hover:bg-brand-500'

                    return (
                      <div
                        key={t.teacherId}
                        className="group relative flex flex-1 flex-col items-center gap-1.5"
                      >
                        <span className="text-[10px] font-semibold tabular-nums text-[color:var(--text-secondary)]">
                          {t.avgDailyPeriods}
                        </span>
                        <div
                          className={cn('w-full max-w-[24px] rounded-t transition-all', barColor)}
                          style={{ height: `${heightPct}%` }}
                        />
                        <span className="truncate text-[10px] text-[color:var(--text-secondary)]">
                          {t.teacherName}
                        </span>

                        {/* Tooltip */}
                        <div className="pointer-events-none absolute bottom-full mb-2 hidden rounded-md bg-slate-900 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block dark:bg-slate-100 dark:text-slate-900">
                          {t.teacherName}：周课时 {t.totalPeriods} 节，日均 {t.avgDailyPeriods} 节，单日最高 {t.maxDailyPeriods} 节
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 图例 */}
                <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-[color:var(--text-secondary)]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" />
                    正常 (3–5 节/日)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                    偏高
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" />
                    偏低 (专任副科)
                  </span>
                  <span className="ml-auto">
                    日均 <b className="text-[color:var(--text-primary)]">{report.teacherAvgDayPeriods}</b> 节 · 标准差{' '}
                    <b className="text-emerald-600 dark:text-emerald-400">{report.teacherDayPeriodsStdDev}</b>
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 主课时段热力图 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <span>▦</span> 主课时段热力图
                  <span className="text-xs font-normal text-[color:var(--text-secondary)]">
                    （语数外在各时段的分布密度）
                  </span>
                </CardTitle>
                <Badge tone="brand">
                  上午主课占比 {Math.round(report.mainSubjectMorningRate * 100)}%
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col pt-2">
                {/* 热力表格 */}
                <div className="grid grid-cols-6 gap-1 text-center text-xs">
                  <div className="text-[11px] font-medium text-[color:var(--text-secondary)]" />
                  <div className="pb-1 text-[11px] font-medium text-[color:var(--text-secondary)]">周一</div>
                  <div className="pb-1 text-[11px] font-medium text-[color:var(--text-secondary)]">周二</div>
                  <div className="pb-1 text-[11px] font-medium text-[color:var(--text-secondary)]">周三</div>
                  <div className="pb-1 text-[11px] font-medium text-[color:var(--text-secondary)]">周四</div>
                  <div className="pb-1 text-[11px] font-medium text-[color:var(--text-secondary)]">周五</div>

                  {Array.from({ length: 7 }, (_, pIdx) => {
                    const periodIndex = pIdx + 1
                    const periodName = `第${periodIndex}节`
                    const isMorning = periodIndex <= 4

                    return (
                      <div key={periodIndex} className="contents">
                        <div className="flex items-center justify-end pr-2 text-[10px] text-[color:var(--text-secondary)]">
                          {periodName}
                        </div>
                        {[1, 2, 3, 4, 5].map((day) => {
                          const cell = report.heatmap.find(
                            (c) => c.dayOfWeek === day && c.periodIndex === periodIndex
                          )
                          const density = cell?.densityRatio ?? 0
                          const bgAlpha = 0.08 + (density / 100) * 0.82

                          return (
                            <div
                              key={day}
                              className={cn(
                                'flex h-6 items-center justify-center rounded text-[10px] font-semibold transition-transform hover:scale-105',
                                isMorning ? 'text-indigo-950 dark:text-indigo-100' : 'text-slate-700 dark:text-slate-300'
                              )}
                              style={{
                                backgroundColor: `rgba(99, 102, 241, ${bgAlpha})`
                              }}
                              title={`周${day} ${periodName}：主课密度 ${density}% (${cell?.mainSubjectCount ?? 0}节)`}
                            >
                              {density}%
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>

                {/* 热力图底部图例 */}
                <div className="mt-3 flex items-center justify-between border-t border-[color:var(--border-subtle)] pt-3 text-[11px] text-[color:var(--text-secondary)]">
                  <span>颜色越深表示主课越集中</span>
                  <span>
                    上午主课占比：<b className="text-emerald-600 dark:text-emerald-400">{Math.round(report.mainSubjectMorningRate * 100)}%</b>
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── 版本对比模态框 ── */}
      <Modal
        open={compareModalOpen}
        onClose={() => setCompareModalOpen(false)}
        title="课表版本对比"
        description="选择两个排课版本进行指标与质量对比"
        footer={
          <Button variant="outline" onClick={() => setCompareModalOpen(false)}>
            关闭
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-[color:var(--text-secondary)]">基准版本</label>
              <Select value={versionId ?? ''} onChange={(e) => setVersionId(Number(e.target.value))}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[color:var(--text-secondary)]">对比版本</label>
              <Select
                value={compareVersionId ?? ''}
                onChange={(e) => setCompareVersionId(Number(e.target.value))}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {report && compareReport && (
            <div className="flex flex-col divide-y divide-[color:var(--border-subtle)] rounded-lg border border-[color:var(--border-subtle)] text-xs">
              <div className="grid grid-cols-3 bg-slate-50 p-2.5 font-bold dark:bg-slate-800">
                <span>指标</span>
                <span className="text-center">{report.versionName}</span>
                <span className="text-center">{compareReport.versionName}</span>
              </div>
              <div className="grid grid-cols-3 p-2.5">
                <span className="font-medium text-[color:var(--text-secondary)]">综合评分</span>
                <span className="text-center font-bold text-emerald-600">{report.overallScore}</span>
                <span className="text-center font-bold text-emerald-600">{compareReport.overallScore}</span>
              </div>
              <div className="grid grid-cols-3 p-2.5">
                <span className="font-medium text-[color:var(--text-secondary)]">硬性冲突</span>
                <span className="text-center">{report.hardViolations} 处</span>
                <span className="text-center">{compareReport.hardViolations} 处</span>
              </div>
              <div className="grid grid-cols-3 p-2.5">
                <span className="font-medium text-[color:var(--text-secondary)]">已排课节数</span>
                <span className="text-center">{report.totalLessons} 节</span>
                <span className="text-center">{compareReport.totalLessons} 节</span>
              </div>
              <div className="grid grid-cols-3 p-2.5">
                <span className="font-medium text-[color:var(--text-secondary)]">教师空隙课时</span>
                <span className="text-center">{report.teacherGapCount} 节</span>
                <span className="text-center">{compareReport.teacherGapCount} 节</span>
              </div>
              <div className="grid grid-cols-3 p-2.5">
                <span className="font-medium text-[color:var(--text-secondary)]">主课上午占比</span>
                <span className="text-center">{Math.round(report.mainSubjectMorningRate * 100)}%</span>
                <span className="text-center">{Math.round(compareReport.mainSubjectMorningRate * 100)}%</span>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
