import { NavLink } from 'react-router-dom'
import { cn } from '@renderer/lib/utils'
import { NAV_ITEMS } from './navConfig'
import { useUiStore } from '@renderer/stores/uiStore'

export function Sidebar(): React.JSX.Element {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] transition-[width] duration-150 ease-std',
        // 窄窗口自动收窄一档，手动折叠后只留图标
        collapsed ? 'w-[3.75rem]' : 'w-52 xl:w-60'
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2',
          collapsed ? 'justify-center px-0' : 'px-5'
        )}
      >
        <span className="text-lg font-semibold tracking-tight" title="智课排">
          {collapsed ? '智' : '智课排'}
        </span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            title={item.label}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-btn py-2 text-sm font-medium transition-colors duration-150 ease-std',
                collapsed ? 'justify-center px-0' : 'justify-between px-3',
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100'
                  : 'text-[color:var(--text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-800'
              )
            }
          >
            <span className={cn('flex items-center', collapsed ? '' : 'gap-2')}>
              <span aria-hidden>{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </span>
            {!collapsed && !item.implemented && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600"
                title="功能待后续里程碑实现"
              />
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
