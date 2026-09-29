import { useState } from 'react'
import { cn } from '@renderer/lib/utils'
import { GradeClassTab } from './GradeClassTab'
import { SubjectTab } from './SubjectTab'
import { TeacherTab } from './TeacherTab'
import { ClassroomTab } from './ClassroomTab'

type TabKey = 'gradeClass' | 'subject' | 'teacher' | 'classroom'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'gradeClass', label: '年级 / 班级' },
  { key: 'subject', label: '学科' },
  { key: 'teacher', label: '教师' },
  { key: 'classroom', label: '教室' }
]

export function BaseDataPage(): React.JSX.Element {
  const [tab, setTab] = useState<TabKey>('gradeClass')

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">基础数据</h1>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          维护年级班级、学科、教师、教室——排课的输入基础
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[color:var(--border-subtle)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
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

      <div>
        {tab === 'gradeClass' && <GradeClassTab />}
        {tab === 'subject' && <SubjectTab />}
        {tab === 'teacher' && <TeacherTab />}
        {tab === 'classroom' && <ClassroomTab />}
      </div>
    </div>
  )
}
