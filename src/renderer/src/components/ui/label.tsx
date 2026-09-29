import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-sm font-medium text-[color:var(--text-primary)]', className)}
    {...props}
  />
))
Label.displayName = 'Label'
