import { useEffect, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { useMetaStore } from '@renderer/stores/metaStore'
import { TimeRuleTab } from './TimeRuleTab'
import { SubjectRuleTab } from './SubjectRuleTab'
import { FixedLessonTab } from './FixedLessonTab'
import { ConstraintGroupTab } from './ConstraintGroupTab'
import { SolverInputTab } from './SolverInputTab'

type TabKey = 'time' | 'subject' | 'fixed' | 'group' | 'check'

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: 'time', label: '时段规则', hint: '四层规则值调色网格' },
  { key: 'subject', label: '学科规则', hint: '每日上限 / 连堂 / 分布策略' },
  { key: 'fixed', label: '预排锁定', hint: '升旗、班会等固定占位' },
  { key: 'group', label: '约束组', hint: '互斥 / 拼合 / 跟随' },
  { key: 'check', label: '输入自检', hint: '组装 SolverInput 并体检' }
]

export function RulesPage(): React.JSX.Element {
  const { currentSemester, loaded, load } = useSchoolStore()
  const meta = useMetaStore()
  const [tab, setTab] = useState<TabKey>('time')
  const semesterId = currentSemester?.id ?? null

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    if (semesterId != null) void meta.load(semesterId)
  }, [semesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (semesterId == null) {
    return (
      <div className="mx-auto max-w-xl rounded-card border border-dashed border-[color:var(--border-subtle)] p-10 text-center text-sm text-[color:var(--text-secondary)]">
        请先到「学校设置」创建并选择当前学期，再来配置排课规则。
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">排课规则</h1>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          禁排 / 避排 / 常规 / 优选四层规则值 + 学科规则 + 预排锁定 + 约束组 ·{' '}
          {currentSemester?.name}
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-[color:var(--border-subtle)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            title={t.hint}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-brand-600 text-brand-700 dark:text-brand-100'
                : 'border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'time' && <TimeRuleTab semesterId={semesterId} />}
      {tab === 'subject' && <SubjectRuleTab semesterId={semesterId} />}
      {tab === 'fixed' && <FixedLessonTab semesterId={semesterId} />}
      {tab === 'group' && <ConstraintGroupTab semesterId={semesterId} />}
      {tab === 'check' && <SolverInputTab semesterId={semesterId} />}
    </div>
  )
}
