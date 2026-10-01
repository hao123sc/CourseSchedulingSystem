import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, scheduleEvents } from '@renderer/lib/api'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { useMetaStore } from '@renderer/stores/metaStore'
import { toast } from '@renderer/stores/toastStore'
import type { ScheduleVersion, WeightProfile } from '@shared/types/entities'
import type { ScheduleDonePayload, ScheduleProgressPayload, SolvePhase } from '@shared/types/ipc'
import type { Diagnosis } from '@shared/domain'
import { DiagnosisCard } from '@renderer/components/scheduling/DiagnosisCard'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'

type Phase = 'idle' | 'running' | 'done'

interface DoneState {
  status: ScheduleDonePayload['status']
  versionId: number | null
  versionName: string | null
  lessonCount: number
  lockedCount: number
  skippedFixed: number
  unplacedCount: number
  violationCount: number
  accidentalBlocks: number
  elapsedMs: number
  starts: number
  diagnostics: Diagnosis[]
  error: string | null
}

const PHASE_LABELS: Record<SolvePhase, string> = {
  init: '准备数据',
  precheck: '输入与规则检查',
  build: '生成初始课表',
  hard_repair: '校验硬约束',
  optimize: '优化质量指标',
  polish: '精细打磨',
  done: '完成'
}

/** 5 个用户可见阶段，对应侧栏与进度展示 */
const STEP_LIST: { phase: SolvePhase; title: string; desc: string }[] = [
  { phase: 'precheck', title: '输入与规则检查', desc: '检查教师工作量、教室容量与规则冲突' },
  { phase: 'build', title: '生成初始课表', desc: '按连堂/专用教室/主课优先级编排' },
  { phase: 'hard_repair', title: '校验硬约束', desc: '确保无教师/班级/场地时间重叠' },
  { phase: 'optimize', title: '优化质量指标', desc: '兼顾教师日负荷、主课时段与学科分散' },
  { phase: 'polish', title: '精细打磨', desc: '收敛空隙课时与微调局部时段' }
]

export function SchedulingPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { currentSemester, loaded, load } = useSchoolStore()
  const meta = useMetaStore()
  const semesterId = currentSemester?.id ?? null

  const [profiles, setProfiles] = useState<WeightProfile[]>([])
  const [selectedProfile, setSelectedProfile] = useState<string>('balanced')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ScheduleProgressPayload | null>(null)
  const [done, setDone] = useState<DoneState | null>(null)
  const [versions, setVersions] = useState<ScheduleVersion[]>([])
  const [runningId, setRunningId] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  useEffect(() => {
    if (semesterId != null) void meta.load(semesterId)
  }, [semesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api['weightProfile:list']()
      .then((rows) => {
        setProfiles(rows)
        const def = rows.find((r) => r.isDefault) ?? rows[0]
        if (def) setSelectedProfile(def.code)
      })
      .catch((e) => toast.error(`读取权重配置失败：${String(e)}`))
  }, [])

  const reloadVersions = (): void => {
    if (semesterId == null) return
    api['schedule:listVersions'](semesterId)
      .then((rows) => setVersions(rows))
      .catch((e) => toast.error(`读取版本列表失败：${String(e)}`))
  }
  useEffect(() => {
    reloadVersions()
  }, [semesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsub = scheduleEvents.onScheduleEvent((ev) => {
      if (ev.type === 'progress') {
        setProgress(ev)
      } else if (ev.type === 'done') {
        setRunningId(null)
        setPhase('done')
        setDone({
          status: ev.status,
          versionId: ev.versionId,
          versionName: ev.versionName,
          lessonCount: ev.lessonCount,
          lockedCount: ev.lockedCount,
          skippedFixed: ev.skippedFixed,
          unplacedCount: ev.unplacedCount,
          violationCount: ev.violationCount,
          accidentalBlocks: ev.accidentalBlocks,
          elapsedMs: ev.elapsedMs,
          starts: ev.starts,
          diagnostics: ev.diagnostics,
          error: ev.error
        })
        reloadVersions()
        if (ev.status === 'solved') {
          toast.success(`排课完成！已生成 ${ev.versionName}，共 ${ev.lessonCount} 节课`)
        } else if (ev.status === 'partial') {
          toast.warning(`排课完成但有 ${ev.unplacedCount} 节未排入，请查看诊断卡`)
        } else if (ev.status === 'infeasible') {
          toast.error('当前数据无法排出完整课表，请按诊断项调整')
        } else if (ev.status === 'cancelled') {
          toast.info('排课已取消')
        } else {
          toast.error(`排课失败：${ev.error ?? '未知错误'}`)
        }
      }
    })
    return () => unsub()
  }, [semesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (): Promise<void> => {
    if (semesterId == null) {
      toast.error('请先选择学期')
      return
    }
    setPhase('running')
    setProgress({
      type: 'progress',
      runId: 'pending',
      ratio: 0.05,
      message: '正在准备排课数据...',
      phase: 'init',
      start: 1,
      totalStarts: 1
    })
    setDone(null)
    try {
      const res = await api['schedule:start']({
        semesterId,
        weightProfileCode: selectedProfile
      })
      setRunningId(res.runId)
    } catch (e) {
      setPhase('idle')
      setProgress(null)
      toast.error(`启动排课失败：${String(e)}`)
    }
  }

  const cancel = async (): Promise<void> => {
    if (!runningId) return
    try {
      await api['schedule:cancel'](runningId)
      toast.info('正在取消排课...')
    } catch (e) {
      toast.error(`取消失败：${String(e)}`)
    }
  }

  const removeVersion = async (vid: number): Promise<void> => {
    if (!confirm('确定删除此排课版本？相关课表数据将一并清理。')) return
    try {
      await api['schedule:deleteVersion'](vid)
      toast.success('已删除排课版本')
      reloadVersions()
    } catch (e) {
      toast.error(`删除失败：${String(e)}`)
    }
  }

  const currentStepIndex = useMemo(() => {
    if (!progress) return -1
    const p = progress.phase
    return STEP_LIST.findIndex((s) => s.phase === p)
  }, [progress])

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">开始排课</h1>
        <p className="text-sm text-[color:var(--text-secondary)]">
          选择排课策略，系统将根据教学任务与排课规则自动生成最优课表
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── 左侧配置卡 ── */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>排课设置</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* 权重档位 */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-[color:var(--text-secondary)]">
                优化风格
              </label>
              <div className="flex flex-col gap-2">
                {profiles.map((p) => {
                  const checked = p.code === selectedProfile
                  return (
                    <label
                      key={p.code}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-all ${
                        checked
                          ? 'border-brand-600 bg-brand-50/50 shadow-sm dark:bg-brand-950/30'
                          : 'border-[color:var(--border-subtle)] hover:border-slate-300 dark:hover:border-slate-700'
                      } ${phase === 'running' ? 'pointer-events-none opacity-60' : ''}`}
                    >
                      <input
                        type="radio"
                        name="weightProfile"
                        value={p.code}
                        checked={checked}
                        disabled={phase === 'running'}
                        onChange={() => setSelectedProfile(p.code)}
                        className="mt-0.5"
                      />
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-[color:var(--text-secondary)]">{p.desc}</span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* 范围选项 */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-[color:var(--text-secondary)]">
                排课范围
              </label>
              <div className="rounded-lg border border-[color:var(--border-subtle)] p-3 text-xs text-[color:var(--text-secondary)]">
                <p className="font-medium text-[color:var(--text-primary)]">全校所有年级全量排课</p>
                <p className="mt-1">
                  共 {meta.classes.length} 个班级 · {meta.teachers.filter((t) => t.enabled).length}{' '}
                  位教师 · {meta.classrooms.filter((r) => r.enabled).length} 间教室
                </p>
              </div>
            </div>

            {/* 启动按钮 */}
            <Button
              className="w-full"
              disabled={phase === 'running' || semesterId == null}
              onClick={() => void start()}
            >
              {phase === 'running' ? '正在排课中...' : '开始自动排课'}
            </Button>
          </CardContent>
        </Card>

        {/* ── 右侧进度 / 结果卡 ── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {phase === 'idle'
                ? '排课阶段说明'
                : phase === 'running'
                  ? '排课进行中'
                  : '排课结果'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {phase === 'idle' && (
              <>
                <p className="text-sm text-[color:var(--text-secondary)]">
                  点击左侧「开始自动排课」后，系统将在后台依次执行以下 5 个阶段：
                </p>
                <ol className="flex flex-col gap-3">
                  {STEP_LIST.map((s, idx) => (
                    <li
                      key={s.phase}
                      className="flex items-start gap-3 rounded-lg border border-[color:var(--border-subtle)] p-3 text-sm"
                    >
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-slate-100 text-xs font-semibold dark:bg-slate-800">
                        {idx + 1}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-medium">{s.title}</span>
                        <span className="text-xs text-[color:var(--text-secondary)]">{s.desc}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}

            {phase === 'running' && (
              <>
                {/* 整体进度条 */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs text-[color:var(--text-secondary)]">
                    <span>{progress?.message ?? '计算中...'}</span>
                    <span className="font-semibold tabular-nums">
                      {Math.round((progress?.ratio ?? 0) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full bg-brand-600 transition-all duration-300"
                      style={{ width: `${Math.max(4, Math.round((progress?.ratio ?? 0) * 100))}%` }}
                    />
                  </div>
                  {progress && progress.totalStarts > 1 && (
                    <p className="text-xs text-[color:var(--text-secondary)]">
                      多起点并行搜索中（{progress.totalStarts} 个起点），将自动采纳得分最高方案
                    </p>
                  )}
                </div>

                {/* 步骤列表 */}
                <ol className="flex flex-col gap-2.5">
                  {STEP_LIST.map((s, idx) => {
                    const isDone = currentStepIndex > idx
                    const isCurrent = currentStepIndex === idx
                    return (
                      <li
                        key={s.phase}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition-all ${
                          isCurrent
                            ? 'border-brand-600 bg-brand-50/40 dark:bg-brand-950/20'
                            : isDone
                              ? 'border-emerald-200 bg-emerald-50/20 dark:border-emerald-900/30'
                              : 'border-[color:var(--border-subtle)] opacity-60'
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold ${
                            isDone
                              ? 'bg-emerald-600 text-white'
                              : isCurrent
                                ? 'bg-brand-600 text-white'
                                : 'bg-slate-100 text-[color:var(--text-secondary)] dark:bg-slate-800'
                          }`}
                        >
                          {isDone ? '✓' : idx + 1}
                        </span>
                        <span className="font-medium">{s.title}</span>
                        {isCurrent && (
                          <span className="ml-auto text-xs text-brand-600 animate-pulse">
                            处理中...
                          </span>
                        )}
                        {isDone && (
                          <span className="ml-auto text-xs text-emerald-600 font-medium">已完成</span>
                        )}
                      </li>
                    )
                  })}
                </ol>

                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => void cancel()}>
                    取消
                  </Button>
                </div>
              </>
            )}

            {phase === 'done' && done && (
              <DoneView
                done={done}
                onAgain={() => setPhase('idle')}
                onOpenTimetable={() => navigate('/timetable')}
                onOpenReport={() => navigate(done.versionId ? `/report?versionId=${done.versionId}` : '/report')}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 诊断卡（有诊断才显示）── */}
      {done && done.diagnostics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {done.status === 'infeasible'
                ? '排课前发现的问题（当前数据排不出完整课表）'
                : `排课中发现 ${done.diagnostics.length} 个问题`}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {[...done.diagnostics]
              .sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1))
              .map((d, i) => (
                <DiagnosisCard key={`${d.code}-${i}`} item={d} />
              ))}
          </CardContent>
        </Card>
      )}

      {/* ── 版本列表 ── */}
      <Card>
        <CardHeader>
          <CardTitle>本学期的课表版本</CardTitle>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <p className="py-4 text-center text-sm text-[color:var(--text-secondary)]">
              还没有排课结果。完成一次排课后，这里会出现可查看、可对比的课表版本。
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-[color:var(--border-subtle)]">
              {versions.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                  <span className="font-medium">{v.name}</span>
                  {v.isPublished && <Badge tone="green">已发布</Badge>}
                  <span className="text-xs text-[color:var(--text-secondary)]">
                    {new Date(v.createdAt.replace(' ', 'T')).toLocaleString('zh-CN', {
                      hour12: false
                    })}
                  </span>
                  <span className="ml-auto flex items-center gap-3 text-xs text-[color:var(--text-secondary)]">
                    <span>{v.lessonCount} 节课</span>
                    <span>硬约束违反 {v.hardViolations}</span>
                    {v.solveMs != null && <span>{(v.solveMs / 1000).toFixed(1)} 秒</span>}
                    <button
                      className="rounded px-1.5 py-0.5 text-xs text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                      onClick={() => navigate(`/timetable?versionId=${v.id}`)}
                    >
                      课表
                    </button>
                    <button
                      className="rounded px-1.5 py-0.5 text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                      onClick={() => navigate(`/report?versionId=${v.id}`)}
                    >
                      体检报告
                    </button>
                    <button
                      className="rounded px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                      onClick={() => navigate(`/export?versionId=${v.id}`)}
                    >
                      导出
                    </button>
                    <button
                      className="rounded px-1.5 py-0.5 text-xs text-[color:var(--text-secondary)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      onClick={() => void removeVersion(v.id)}
                    >
                      删除
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** 完成后的结果视图：solved / partial / infeasible / cancelled / failed 各有口径 */
function DoneView({
  done,
  onAgain,
  onOpenTimetable,
  onOpenReport
}: {
  done: DoneState
  onAgain: () => void
  onOpenTimetable: () => void
  onOpenReport?: () => void
}): React.JSX.Element {
  if (done.status === 'solved') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white">
            ✓
          </span>
          <div>
            <p className="font-semibold">排课完成</p>
            <p className="text-xs text-[color:var(--text-secondary)]">{done.versionName}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="课程" value={`${done.lessonCount} 节`} />
          <Stat label="未排" value={`${done.unplacedCount} 节`} ok={done.unplacedCount === 0} />
          <Stat
            label="硬约束违反"
            value={`${done.violationCount}`}
            ok={done.violationCount === 0}
          />
          <Stat
            label="意外连堂"
            value={`${done.accidentalBlocks} 对`}
            ok={done.accidentalBlocks === 0}
          />
        </div>
        <p className="text-xs text-[color:var(--text-secondary)]">
          {done.starts > 1 ? `${done.starts} 个起点并行取最优 · ` : ''}
          耗时 {(done.elapsedMs / 1000).toFixed(1)} 秒
          {done.lockedCount > 0 ? ` · 其中预排锁定 ${done.lockedCount} 节` : ''}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onAgain}>
            再排一次
          </Button>
          {onOpenReport && (
            <Button variant="outline" onClick={onOpenReport}>
              📊 体检报告
            </Button>
          )}
          <Button onClick={onOpenTimetable}>查看课表 →</Button>
        </div>
      </div>
    )
  }

  if (done.status === 'partial') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white">
            !
          </span>
          <div>
            <p className="font-semibold">课表已生成，但有 {done.unplacedCount} 节没排进去</p>
            <p className="text-xs text-[color:var(--text-secondary)]">
              {done.versionName} · 结果已保存，具体原因见下方诊断
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onAgain}>
            再排一次
          </Button>
          {onOpenReport && (
            <Button variant="outline" onClick={onOpenReport}>
              📊 体检报告
            </Button>
          )}
          <Button onClick={onOpenTimetable}>查看课表 →</Button>
        </div>
      </div>
    )
  }

  if (done.status === 'infeasible') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white">
            ✕
          </span>
          <div>
            <p className="font-semibold">当前数据排不出完整课表</p>
            <p className="text-xs text-[color:var(--text-secondary)]">
              按下面的诊断逐条处理后再来排课
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onAgain}>
            重新开始
          </Button>
        </div>
      </div>
    )
  }

  if (done.status === 'cancelled') {
    return (
      <div className="flex flex-col gap-3 py-2">
        <p className="text-sm text-[color:var(--text-secondary)]">已取消，本次没有生成课表。</p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onAgain}>
            重新开始
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white">
          ✕
        </span>
        <div>
          <p className="font-semibold">排课失败</p>
          <p className="text-xs text-[color:var(--text-secondary)]">{done.error ?? '未知错误'}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={onAgain}>
          重试
        </Button>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  ok
}: {
  label: string
  value: string
  ok?: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-col rounded-lg border border-[color:var(--border-subtle)] p-2.5">
      <span className="text-xs text-[color:var(--text-secondary)]">{label}</span>
      <span
        className={`mt-0.5 text-base font-bold tabular-nums ${
          ok === true ? 'text-emerald-600' : ok === false ? 'text-amber-600' : ''
        }`}
      >
        {value}
      </span>
    </div>
  )
}
