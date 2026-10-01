import * as React from 'react'
import { cn } from '@renderer/lib/utils'

/** 轻量原生 select，样式对齐 Input */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-9 w-full rounded-input border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    {children}
  </select>
))
Select.displayName = 'Select'
