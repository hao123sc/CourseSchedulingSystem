import { useToastStore } from '@renderer/stores/toastStore'
import { cn } from '@renderer/lib/utils'

const TONE_STYLES: Record<string, string> = {
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  error:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200',
  info: 'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
}
const TONE_ICON: Record<string, string> = { success: '✓', error: '✕', info: 'ℹ' }

export function Toaster(): React.JSX.Element {
  const { toasts, dismiss } = useToastStore()
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            'pointer-events-auto flex cursor-pointer items-start gap-2 rounded-card border px-4 py-3 text-sm shadow-md animate-in fade-in slide-in-from-bottom-2',
            TONE_STYLES[t.tone]
          )}
        >
          <span className="mt-0.5 font-semibold">{TONE_ICON[t.tone]}</span>
          <span className="flex-1">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
