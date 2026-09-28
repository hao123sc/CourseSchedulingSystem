import { NavLink } from 'react-router-dom'
import { cn } from '@renderer/lib/utils'
import { NAV_ITEMS } from './navConfig'

export function Sidebar(): React.JSX.Element {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[color:var(--border-subtle)] bg-[color:var(--bg-card)]">
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="text-lg font-semibold tracking-tight">智课排</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-between rounded-btn px-3 py-2 text-sm font-medium transition-colors duration-150 ease-std',
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                  : 'text-[color:var(--text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-800'
              )
            }
          >
            <span className="flex items-center gap-2">
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </span>
            {!item.implemented && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600"
                title="M0 骨架阶段：功能待后续里程碑实现"
              />
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
