import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-9 w-full rounded-input border border-[color:var(--border-subtle)] bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-[color:var(--text-secondary)] focus:ring-2 focus:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'
