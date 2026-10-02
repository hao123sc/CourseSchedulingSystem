import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import type { Diagnosis } from '@solver/core/diagnosis'

/**
 * 诊断卡（docs/05 §4.4）：排课前发现的问题不是报错弹窗，而是一张友好的卡。
 *
 * 文案由引擎生成，统一回答三件事：哪里不够、差多少、怎么办
 * （src/solver/core/diagnosis.ts）。这里只负责排版：级别徽标 + 标题 + 明细 +
 * 可执行建议列表。error 排前、warn 排后由父级控制。
 */
export function DiagnosisCard({ item }: { item: Diagnosis }): React.JSX.Element {
  const isWarn = item.level === 'warn'
  return (
    <div
      className={cn(
        'rounded-card border p-4',
        isWarn
          ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20'
          : 'border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20'
      )}
    >
      <div className="flex items-start gap-2">
        <Badge tone={isWarn ? 'amber' : 'red'}>{isWarn ? '需注意' : '排不开'}</Badge>
        <p className="text-sm font-semibold leading-6">{item.title}</p>
      </div>
      <p className="mt-1.5 text-sm leading-6 text-[color:var(--text-secondary)]">{item.detail}</p>
      {item.suggestions.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {item.suggestions.map((s, i) => (
            <li key={i} className="flex items-start gap-1.5 text-sm leading-6">
              <span className="mt-0.5 text-[color:var(--text-secondary)]">→</span>
              <span>{s.replace(/^[①②③④⑤]\s*/, '')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
