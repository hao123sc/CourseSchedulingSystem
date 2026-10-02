import * as React from 'react'
import { useEffect } from 'react'
import { cn } from '@renderer/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

/** 轻量模态框：遮罩点击关闭 + Esc 关闭 + 淡入缩放动效 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className
}: ModalProps): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 flex max-h-[85dvh] w-full max-w-[min(92vw,32rem)] flex-col rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] shadow-lg animate-in fade-in zoom-in-95 duration-150',
          className
        )}
      >
        <div className="border-b border-[color:var(--border-subtle)] px-6 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-[color:var(--text-secondary)]">{description}</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-[color:var(--border-subtle)] px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
