import { useMemo, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  sortValue?: (row: T) => string | number
  align?: 'left' | 'center' | 'right'
  className?: string
}

interface EntityTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => number | string
  /** 返回用于全局搜索匹配的字符串 */
  searchText?: (row: T) => string
  searchPlaceholder?: string
  onEdit?: (row: T) => void
  onDelete?: (row: T) => void
  onDeleteMany?: (rows: T[]) => void
  pageSize?: number
  emptyText?: string
  /** 工具栏右侧插槽（新增 / 导入 / 导出等按钮） */
  toolbar?: React.ReactNode
}

export function EntityTable<T>({
  columns,
  rows,
  rowKey,
  searchText,
  searchPlaceholder = '搜索…',
  onEdit,
  onDelete,
  onDeleteMany,
  pageSize = 20,
  emptyText = '暂无数据',
  toolbar
}: EntityTableProps<T>): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string | number>>(new Set())

  const filtered = useMemo(() => {
    let data = rows
    if (query.trim() && searchText) {
      const q = query.trim().toLowerCase()
      data = data.filter((r) => searchText(r).toLowerCase().includes(q))
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey)
      if (col?.sortValue) {
        const dir = sortDir === 'asc' ? 1 : -1
        data = [...data].sort((a, b) => {
          const va = col.sortValue!(a)
          const vb = col.sortValue!(b)
          if (va < vb) return -1 * dir
          if (va > vb) return 1 * dir
          return 0
        })
      }
    }
    return data
  }, [rows, query, sortKey, sortDir, columns, searchText])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(rowKey(r)))

  function toggleSort(col: Column<T>): void {
    if (!col.sortValue) return
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(col.key)
      setSortDir('asc')
    }
  }

  function toggleRow(key: string | number): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAllOnPage(): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) pageRows.forEach((r) => next.delete(rowKey(r)))
      else pageRows.forEach((r) => next.add(rowKey(r)))
      return next
    })
  }

  const selectable = Boolean(onDeleteMany)
  const hasActions = Boolean(onEdit || onDelete)
  const selectedRows = filtered.filter((r) => selected.has(rowKey(r)))

  const alignCls = (a?: string): string =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {searchText && (
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            placeholder={searchPlaceholder}
            className="h-9 w-56"
          />
        )}
        <div className="flex-1" />
        {selectable && selectedRows.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            onClick={() => {
              onDeleteMany?.(selectedRows)
              setSelected(new Set())
            }}
          >
            删除选中（{selectedRows.length}）
          </Button>
        )}
        {toolbar}
      </div>

      <div className="overflow-hidden rounded-card border border-[color:var(--border-subtle)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[color:var(--border-subtle)] bg-slate-50 dark:bg-slate-800/60">
              {selectable && (
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                    className="h-4 w-4 accent-brand-600"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-3 py-2.5 font-medium text-[color:var(--text-secondary)]',
                    alignCls(col.align),
                    col.sortValue &&
                      'cursor-pointer select-none hover:text-[color:var(--text-primary)]'
                  )}
                  onClick={() => toggleSort(col)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {sortKey === col.key && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </span>
                </th>
              ))}
              {hasActions && (
                <th className="w-28 px-3 py-2.5 text-right font-medium text-[color:var(--text-secondary)]">
                  操作
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0) + (hasActions ? 1 : 0)}
                  className="px-3 py-12 text-center text-[color:var(--text-secondary)]"
                >
                  {emptyText}
                </td>
              </tr>
            )}
            {pageRows.map((row) => {
              const key = rowKey(row)
              return (
                <tr
                  key={key}
                  className="border-b border-[color:var(--border-subtle)] last:border-0 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  {selectable && (
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleRow(key)}
                        className="h-4 w-4 accent-brand-600"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn('px-3 py-2.5', alignCls(col.align), col.className)}
                    >
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                  {hasActions && (
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        {onEdit && (
                          <Button variant="ghost" size="sm" onClick={() => onEdit(row)}>
                            编辑
                          </Button>
                        )}
                        {onDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                            onClick={() => onDelete(row)}
                          >
                            删除
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-[color:var(--text-secondary)]">
        <span>
          共 {filtered.length} 条{selectedRows.length > 0 && ` · 已选 ${selectedRows.length}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </Button>
            <span>
              {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
