import * as React from 'react'
import { cn } from '@renderer/lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'brand' | 'slate' | 'green' | 'amber' | 'red'
}

const TONES: Record<NonNullable<BadgeProps['tone']>, string> = {
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
}

export function Badge({ className, tone = 'slate', ...props }: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className
      )}
      {...props}
    />
  )
}
