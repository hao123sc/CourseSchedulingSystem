import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/stores/toastStore'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import type { SolverInputReport } from '@solver/model/validate'

interface Props {
  semesterId: number
}

const LEVEL_TONE = {
  error: 'red',
  warn: 'amber',
  info: 'slate'
} as const

/**
 * 引擎输入自检（M2 验收项：「数据可完整读出为 SolverInput」）。
 * 主进程把全库数据组装成 SolverInput 快照，再用纯函数 validateSolverInput 体检。
 */
export function SolverInputTab({ semesterId }: Props): React.JSX.Element {
  const [report, setReport] = useState<SolverInputReport | null>(null)
  const [loading, setLoading] = useState(false)

  const run = useCallback(async () => {
    setLoading(true)
    try {
      setReport(await api['solver:checkInput'](semesterId))
    } catch (err) {
      toast.error(`自检失败：${String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [semesterId])

  useEffect(() => {
    void run()
  }, [run])

  const errors = report?.issues.filter((i) => i.level === 'error') ?? []
  const warns = report?.issues.filter((i) => i.level === 'warn') ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-[color:var(--text-secondary)]">
          把当前学期的全部数据组装成排课引擎输入快照并体检 —— 这是 M3 排课的前置条件
        </p>
        <Button className="ml-auto" onClick={() => void run()} disabled={loading}>
          {loading ? '检查中…' : '重新检查'}
        </Button>
      </div>

      {report && (
        <>
          <div
            className={cn(
              'flex items-center gap-3 rounded-card border p-4',
              report.ok
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
            )}
          >
            <span className="text-2xl">{report.ok ? '✅' : '⛔'}</span>
            <div>
              <div className="font-semibold">
                {report.ok ? 'SolverInput 可完整读出，数据齐备' : '存在阻断性问题，暂不能排课'}
              </div>
              <div className="text-xs text-[color:var(--text-secondary)]">
                {errors.length} 个错误 · {warns.length} 个提醒
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="班级" value={report.stats.classes} />
            <Stat label="教师" value={report.stats.teachers} />
            <Stat label="学科" value={report.stats.subjects} />
            <Stat label="教室场地" value={report.stats.rooms} />
            <Stat label="教学任务" value={report.stats.tasks} />
            <Stat label="待排课时/周" value={report.stats.totalPeriods} />
            <Stat label="时段规则" value={report.stats.timeRules} />
            <Stat label="预排占位" value={report.stats.fixedLessons} />
            <Stat label="约束组" value={report.stats.constraintGroups} />
            <Stat
              label="未指派教师"
              value={report.stats.unassignedTasks}
              tone={report.stats.unassignedTasks > 0 ? 'red' : 'green'}
            />
          </div>

          {report.issues.length === 0 ? (
            <p className="rounded-card border border-[color:var(--border-subtle)] p-6 text-center text-sm text-[color:var(--text-secondary)]">
              没有发现问题 🎉
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {report.issues.map((i, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 rounded-btn border border-[color:var(--border-subtle)] px-3 py-1.5 text-sm"
                >
                  <Badge tone={LEVEL_TONE[i.level]}>
                    {i.level === 'error' ? '错误' : i.level === 'warn' ? '提醒' : '信息'}
                  </Badge>
                  <span className="flex-1">{i.message}</span>
                  <code className="text-[10px] text-[color:var(--text-secondary)]">{i.code}</code>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'slate'
}: {
  label: string
  value: number
  tone?: 'slate' | 'red' | 'green'
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3 text-center',
        tone === 'red' && 'border-red-200 dark:border-red-900',
        tone === 'green' && 'border-emerald-200 dark:border-emerald-900'
      )}
    >
      <div
        className={cn(
          'text-xl font-semibold tabular-nums',
          tone === 'red' && 'text-red-600 dark:text-red-300',
          tone === 'green' && 'text-emerald-600 dark:text-emerald-300'
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[color:var(--text-secondary)]">{label}</div>
    </div>
  )
}
