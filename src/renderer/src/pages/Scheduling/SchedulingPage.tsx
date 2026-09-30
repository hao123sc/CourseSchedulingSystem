import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, scheduleEvents } from '@renderer/lib/api'
import { toast } from '@renderer/stores/toastStore'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { DiagnosisCard } from '@renderer/components/scheduling/DiagnosisCard'
import { cn } from '@renderer/lib/utils'
import type { ScheduleVersion, WeightProfile } from '@shared/types/entities'
import type { ScheduleDonePayload, ScheduleProgressPayload } from '@shared/types/ipc'

/**
 * 排课执行页（docs/05 §4.4）。
 *
 * 刻意朴素：方案卡 + 进度条 + 阶段清单 + 人话描述 + 诊断卡。
 * 不显示罚分、温度、算子权重——评委不关心，反而显得复杂。
 *
 * M3 口径：先保证「排满 + 零冲突」；「优化课表质量 / 精细调整」两个阶段
 * 属 M5 引擎 v2，届时在阶段清单里补上。
 * 范围只开放「全校」；按年级局部重排与「保留已锁定课程」属 M6 增量重排。
 */

type RunPhase = 'idle' | 'running' | 'done'

/** 阶段清单：phase → 步骤（M5 会在 2、3 之间插入质量优化两步） */
const STEPS = [
  { key: 'preprocess', label: '输入与规则检查' },
  { key: 'construct', label: '生成初始课表' },
  { key: 'optimize', label: '优化课表质量' },
  { key: 'verify', label: '校验硬约束' }
] as const

const PHASE_TEXT: Record<string, string> = {
  preprocess: '正在检查排课规则…',
  construct: '正在生成初始课表…',
  repair: '正在安放剩余课程…',
  optimize: '正在优化课表质量…',
  verify: '正在校验硬约束…',
  done: '完成'
}

/** 风格档位的补充说明（docs/05 §4.4 的示例文案，按 code 匹配） */
const PROFILE_HINT: Record<string, string> = {
  teacher_first: '更看重教师课时均衡、减少空隙课',
  balanced: '各项软约束均衡取舍，适合大多数学校',
  student_first: '更看重同科分散、主课排上午'
}

interface DoneState {
  status: ScheduleDonePayload['status']
  versionName: string | null
  versionId: number | null
  lessonCount: number
  lockedCount: number
  elapsedMs: number
  unplacedCount: number
  violationCount: number
  accidentalBlocks: number
  starts: number
  diagnostics: NonNullable<ScheduleDonePayload['summary']>['diagnostics']
  error?: string
}

export function SchedulingPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { currentSemester, loaded, load } = useSchoolStore()
  const semesterId = currentSemester?.id ?? null

  const [profiles, setProfiles] = useState<WeightProfile[]>([])
  const [profileCode, setProfileCode] = useState('balanced')
  const [phase, setPhase] = useState<RunPhase>('idle')
  const [progress, setProgress] = useState<ScheduleProgressPayload | null>(null)
  const [done, setDone] = useState<DoneState | null>(null)
  const [versions, setVersions] = useState<ScheduleVersion[]>([])
  /** 本组件实例是否是这次排课的发起方（决定结束后是否弹 toast） */
  const startedHere = useRef(false)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const refreshVersions = useCallback(async () => {
    if (semesterId == null) return
    try {
      setVersions(await api['schedule:listVersions'](semesterId))
    } catch {
      /* 版本列表拉不到不阻塞主流程 */
    }
  }, [semesterId])

  useEffect(() => {
    if (semesterId == null) return
    void refreshVersions()
    void api['weightProfile:list']()
      .then(setProfiles)
      .catch(() => {})
    // 页面在排课进行中被重新打开时，恢复「进行中」的显示
    void api['schedule:isRunning']()
      .then((running) => {
        if (running) setPhase('running')
      })
      .catch(() => {})
  }, [semesterId, refreshVersions])

  // 订阅排课事件（预览模式下 scheduleEvents 自动退化为轮询）
  useEffect(() => {
    const off = scheduleEvents.onScheduleEvent((e) => {
      if (e.type === 'progress') {
        setPhase('running')
        setProgress(e)
      } else {
        setPhase('done')
        setProgress(null)
        setDone({
          status: e.status,
          versionId: e.versionId,
          versionName: e.versionName,
          lessonCount: e.lessonCount,
          lockedCount: e.lockedCount,
          elapsedMs: e.summary?.stats.elapsedMs ?? 0,
          unplacedCount: e.summary?.unplacedCount ?? 0,
          violationCount: e.summary?.violations.length ?? 0,
          accidentalBlocks: e.summary?.stats.accidentalBlocks ?? 0,
          starts: e.summary?.stats.starts ?? 0,
          diagnostics: e.summary?.diagnostics ?? [],
          error: e.error
        })
        if (startedHere.current) {
          if (e.status === 'solved') {
            toast.success(`排课完成：${e.versionName ?? ''}（${e.lessonCount} 节课，硬约束违反 0）`)
          } else if (e.status === 'cancelled') {
            toast.info('已取消本次排课')
          }
        }
        startedHere.current = false
        void refreshVersions()
      }
    })
    return off
  }, [refreshVersions])

  const start = useCallback(async () => {
    if (semesterId == null || phase === 'running') return
    setDone(null)
    setProgress(null)
    try {
      await api['schedule:start'](semesterId, { weightProfileCode: profileCode })
      startedHere.current = true
      setPhase('running')
    } catch (err) {
      toast.error(String(err))
    }
  }, [semesterId, phase, profileCode])

  const cancel = useCallback(async () => {
    try {
      await api['schedule:cancel']()
    } catch (err) {
      toast.error(String(err))
    }
  }, [])

  const removeVersion = useCallback(
    async (id: number) => {
      try {
        await api['schedule:deleteVersion'](id)
        toast.success('版本已删除')
        void refreshVersions()
      } catch (err) {
        toast.error(String(err))
      }
    },
    [refreshVersions]
  )

  if (semesterId == null) {
    return (
      <div className="mx-auto max-w-xl rounded-card border border-dashed border-[color:var(--border-subtle)] p-10 text-center text-sm text-[color:var(--text-secondary)]">
        请先到「学校设置」创建并选择当前学期，再来排课。
      </div>
    )
  }

  const activeProfiles = profiles.length > 0 ? profiles : []
  const selectedHint = PROFILE_HINT[profileCode] ?? '软约束权重预设，影响课表质量的取舍方向'

  // 阶段清单的完成态：以见过的最靠后 phase 为准
  const currentPhaseKey = progress?.phase ?? (phase === 'done' ? 'done' : null)
  const stepIndex = (() => {
    if (phase === 'done') return STEPS.length
    if (currentPhaseKey === 'preprocess') return 0
    if (currentPhaseKey === 'construct' || currentPhaseKey === 'repair') return 1
    if (currentPhaseKey === 'verify' || currentPhaseKey === 'done') return 2
    return -1 // running 但还没有任何事件
  })()
  const pct = Math.round((progress?.ratio ?? 0) * 100)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">排课执行</h1>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          一键排出整学期课表 · {currentSemester?.name}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── 方案卡 ── */}
        <Card>
          <CardHeader>
            <CardTitle>排课方案</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-sm font-medium">风格档位</p>
              <div className="flex flex-col gap-1.5">
                {(activeProfiles.length > 0
                  ? activeProfiles
                  : [{ id: 0, code: 'balanced', name: '均衡', payload: {} } as WeightProfile]
                ).map((p) => (
                  <label
                    key={p.code}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-card border px-3.5 py-2.5 text-sm transition-colors',
                      profileCode === p.code
                        ? 'border-brand-500 bg-brand-50/60 dark:border-brand-500 dark:bg-brand-600/10'
                        : 'border-[color:var(--border-subtle)] hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                  >
                    <input
                      type="radio"
                      name="weight-profile"
                      className="accent-brand-600"
                      checked={profileCode === p.code}
                      onChange={() => setProfileCode(p.code)}
                      disabled={phase === 'running'}
                    />
                    <span className="font-medium">{p.name}</span>
                    {PROFILE_HINT[p.code] && (
                      <span className="text-xs text-[color:var(--text-secondary)]">
                        {PROFILE_HINT[p.code]}
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-[color:var(--text-secondary)]">{selectedHint}</p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">排课范围</p>
              <div className="flex flex-col gap-1.5">
                <label className="flex cursor-pointer items-center gap-2.5 rounded-card border border-[color:var(--border-subtle)] px-3.5 py-2.5 text-sm">
                  <input type="radio" name="scope" checked readOnly className="accent-brand-600" />
                  <span className="font-medium">全校</span>
                  <span className="text-xs text-[color:var(--text-secondary)]">
                    当前学期的全部班级一次排完
                  </span>
                </label>
                <label className="flex cursor-not-allowed items-center gap-2.5 rounded-card border border-dashed border-[color:var(--border-subtle)] px-3.5 py-2.5 text-sm opacity-60">
                  <input type="radio" name="scope" disabled />
                  <span>指定年级</span>
                  <span className="text-xs text-[color:var(--text-secondary)]">
                    局部重排属后续「交互调整」阶段
                  </span>
                </label>
              </div>
            </div>

            <Button
              className="h-11 w-full text-base"
              onClick={() => void start()}
              disabled={phase === 'running'}
            >
              {phase === 'running' ? '正在排课…' : '▶ 开始排课'}
            </Button>
          </CardContent>
        </Card>

        {/* ── 进度 / 结果卡 ── */}
        <Card>
          <CardHeader>
            <CardTitle>{phase === 'running' ? '正在排课' : '执行状态'}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {phase === 'idle' && (
              <p className="py-8 text-center text-sm text-[color:var(--text-secondary)]">
                还没有开始。选好风格档位后点「开始排课」。
              </p>
            )}

            {phase === 'running' && (
              <>
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span>{PHASE_TEXT[progress?.phase ?? ''] ?? '正在排课…'}</span>
                    <span className="tabular-nums text-[color:var(--text-secondary)]">{pct}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={cn(
                        'h-full rounded-full bg-brand-500 transition-[width] duration-300',
                        progress == null && 'w-1/12 animate-pulse'
                      )}
                      style={progress != null ? { width: `${Math.max(2, pct)}%` } : undefined}
                    />
                  </div>
                  {progress && (
                    <p className="mt-1.5 text-xs text-[color:var(--text-secondary)]">
                      {progress.totalStarts > 1
                        ? `${progress.totalStarts} 个起点并行计算，取最优结果`
                        : '单起点计算中'}
                    </p>
                  )}
                </div>

                <ol className="flex flex-col gap-2 text-sm">
                  {STEPS.map((s, i) => {
                    const state = stepIndex > i ? 'done' : stepIndex === i ? 'active' : 'todo'
                    return (
                      <li key={s.key} className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs',
                            state === 'done' && 'border-emerald-500 bg-emerald-500 text-white',
                            state === 'active' &&
                              'animate-pulse border-brand-500 text-brand-600 dark:text-brand-300',
                            state === 'todo' &&
                              'border-[color:var(--border-subtle)] text-transparent'
                          )}
                        >
                          {state === 'done' ? '✓' : state === 'active' ? '·' : '·'}
                        </span>
                        <span
                          className={cn(
                            state === 'todo' && 'text-[color:var(--text-secondary)]',
                            state === 'active' && 'font-medium'
                          )}
                        >
                          {s.label}
                        </span>
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
  onOpenTimetable
}: {
  done: DoneState
  onAgain: () => void
  onOpenTimetable: () => void
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
    <div className="rounded-card border border-[color:var(--border-subtle)] px-3 py-2">
      <p className="text-xs text-[color:var(--text-secondary)]">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-semibold tabular-nums',
          ok === false && 'text-red-600 dark:text-red-400'
        )}
      >
        {value}
      </p>
    </div>
  )
}
