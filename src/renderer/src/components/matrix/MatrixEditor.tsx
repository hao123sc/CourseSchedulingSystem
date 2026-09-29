import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@renderer/lib/utils'

export interface MatrixRow {
  classId: number
  /** 班级名 */
  label: string
  /** 分组名（年级），用于分组分隔线 */
  groupLabel: string
  /** 该班一周可排的最大节次（学段作息决定）；超出则整行标黄 */
  capacity: number
}

export interface MatrixCol {
  subjectId: number
  label: string
  shortLabel: string
  color: string
}

export interface MatrixCellValue {
  periods: number
  teacherId: number | null
}

export interface MatrixPatch {
  classId: number
  subjectId: number
  weeklyPeriods?: number
  teacherId?: number | null
}

interface Pos {
  r: number
  c: number
}

interface MatrixEditorProps {
  rows: MatrixRow[]
  cols: MatrixCol[]
  /** key = `${classId}:${subjectId}` */
  values: Map<string, MatrixCellValue>
  teacherName: (teacherId: number) => string
  onChange: (patches: MatrixPatch[]) => void
  /** 点击单元格下半区（教师名）时触发，用于弹出教师指派器 */
  onAssignTeacher: (cells: { classId: number; subjectId: number }[]) => void
  /** 选区变化，父级据此联动右侧工作量面板 */
  onSelectionChange?: (cells: { classId: number; subjectId: number }[]) => void
}

export function cellKey(classId: number, subjectId: number): string {
  return `${classId}:${subjectId}`
}

const EMPTY: MatrixCellValue = { periods: 0, teacherId: null }

/**
 * Excel 式教学任务矩阵编辑器（docs/05 §4.2）。
 *
 * 键盘：方向键移动 / Shift+方向键框选 / Tab·Enter 跳格 / 直接输入数字 /
 *       Ctrl+D 向下填充 / Ctrl+R 向右填充 / Ctrl+C·Ctrl+V 复制粘贴区块 /
 *       Delete 清零 / Esc 取消 / Ctrl+A 全选
 * 鼠标：按住拖选区域，选完直接输入数字即可整片填入；点下半区指派教师
 */
export function MatrixEditor({
  rows,
  cols,
  values,
  teacherName,
  onChange,
  onAssignTeacher,
  onSelectionChange
}: MatrixEditorProps): React.JSX.Element {
  const [anchor, setAnchor] = useState<Pos>({ r: 0, c: 0 })
  const [focus, setFocus] = useState<Pos>({ r: 0, c: 0 })
  const [editing, setEditing] = useState<{ pos: Pos; text: string; fillRange: boolean } | null>(
    null
  )
  const dragging = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const focusCellRef = useRef<HTMLTableCellElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** 内部剪贴板：二维课时数组 */
  const clipboard = useRef<number[][] | null>(null)

  const rect = useMemo(
    () => ({
      r1: Math.min(anchor.r, focus.r),
      r2: Math.max(anchor.r, focus.r),
      c1: Math.min(anchor.c, focus.c),
      c2: Math.max(anchor.c, focus.c)
    }),
    [anchor, focus]
  )

  const inRect = useCallback(
    (r: number, c: number) => r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2,
    [rect]
  )

  const getCell = useCallback(
    (r: number, c: number): MatrixCellValue => {
      const row = rows[r]
      const col = cols[c]
      if (!row || !col) return EMPTY
      return values.get(cellKey(row.classId, col.subjectId)) ?? EMPTY
    },
    [rows, cols, values]
  )

  // ── 合计 ────────────────────────────────────────────────────────────────
  const rowTotals = useMemo(
    () =>
      rows.map((row) =>
        cols.reduce(
          (s, col) => s + (values.get(cellKey(row.classId, col.subjectId))?.periods ?? 0),
          0
        )
      ),
    [rows, cols, values]
  )
  const colTotals = useMemo(
    () =>
      cols.map((col) =>
        rows.reduce(
          (s, row) => s + (values.get(cellKey(row.classId, col.subjectId))?.periods ?? 0),
          0
        )
      ),
    [rows, cols, values]
  )
  const grandTotal = useMemo(() => rowTotals.reduce((a, b) => a + b, 0), [rowTotals])

  // 选区变化 → 通知父级
  useEffect(() => {
    if (!onSelectionChange) return
    const cells: { classId: number; subjectId: number }[] = []
    for (let r = rect.r1; r <= rect.r2; r++) {
      for (let c = rect.c1; c <= rect.c2; c++) {
        const row = rows[r]
        const col = cols[c]
        if (row && col) cells.push({ classId: row.classId, subjectId: col.subjectId })
      }
    }
    onSelectionChange(cells)
  }, [rect, rows, cols, onSelectionChange])

  // 焦点格滚动进视口
  useEffect(() => {
    focusCellRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [focus])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // 行列数变化时把光标夹回有效范围
  useEffect(() => {
    const clamp = (p: Pos): Pos => ({
      r: Math.min(Math.max(0, p.r), Math.max(0, rows.length - 1)),
      c: Math.min(Math.max(0, p.c), Math.max(0, cols.length - 1))
    })
    setAnchor((p) => clamp(p))
    setFocus((p) => clamp(p))
  }, [rows.length, cols.length])

  // ── 写入 ────────────────────────────────────────────────────────────────
  const emit = useCallback(
    (patches: MatrixPatch[]) => {
      if (patches.length > 0) onChange(patches)
    },
    [onChange]
  )

  const fillRange = useCallback(
    (value: number, r1: number, r2: number, c1: number, c2: number) => {
      const patches: MatrixPatch[] = []
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const row = rows[r]
          const col = cols[c]
          if (!row || !col) continue
          if (getCell(r, c).periods === value) continue
          patches.push({ classId: row.classId, subjectId: col.subjectId, weeklyPeriods: value })
        }
      }
      emit(patches)
    },
    [rows, cols, getCell, emit]
  )

  const move = useCallback(
    (dr: number, dc: number, extend: boolean) => {
      const next: Pos = {
        r: Math.min(Math.max(0, focus.r + dr), rows.length - 1),
        c: Math.min(Math.max(0, focus.c + dc), cols.length - 1)
      }
      setFocus(next)
      if (!extend) setAnchor(next)
    },
    [focus, rows.length, cols.length]
  )

  const commitEdit = useCallback(
    (moveDir: 'down' | 'right' | 'none') => {
      if (!editing) return
      const raw = editing.text.trim()
      const parsed = raw === '' ? 0 : Number(raw)
      const value = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
      if (editing.fillRange) {
        fillRange(value, rect.r1, rect.r2, rect.c1, rect.c2)
      } else {
        const row = rows[editing.pos.r]
        const col = cols[editing.pos.c]
        if (row && col && getCell(editing.pos.r, editing.pos.c).periods !== value) {
          emit([{ classId: row.classId, subjectId: col.subjectId, weeklyPeriods: value }])
        }
      }
      setEditing(null)
      if (moveDir === 'down') move(1, 0, false)
      else if (moveDir === 'right') move(0, 1, false)
      gridRef.current?.focus()
    },
    [editing, rect, rows, cols, getCell, emit, fillRange, move]
  )

  // ── 键盘 ────────────────────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (rows.length === 0 || cols.length === 0) return
    const mod = e.ctrlKey || e.metaKey

    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setAnchor({ r: 0, c: 0 })
      setFocus({ r: rows.length - 1, c: cols.length - 1 })
      return
    }
    if (mod && e.key.toLowerCase() === 'd') {
      // Ctrl+D：用选区首行的值向下填充整个选区（选区只有一行时填到本列末尾）
      e.preventDefault()
      const patches: MatrixPatch[] = []
      const lastRow = rect.r1 === rect.r2 ? rows.length - 1 : rect.r2
      for (let c = rect.c1; c <= rect.c2; c++) {
        const src = getCell(rect.r1, c).periods
        for (let r = rect.r1 + 1; r <= lastRow; r++) {
          const row = rows[r]
          const col = cols[c]
          if (!row || !col || getCell(r, c).periods === src) continue
          patches.push({ classId: row.classId, subjectId: col.subjectId, weeklyPeriods: src })
        }
      }
      emit(patches)
      return
    }
    if (mod && e.key.toLowerCase() === 'r') {
      // Ctrl+R：向右填充
      e.preventDefault()
      const patches: MatrixPatch[] = []
      const lastCol = rect.c1 === rect.c2 ? cols.length - 1 : rect.c2
      for (let r = rect.r1; r <= rect.r2; r++) {
        const src = getCell(r, rect.c1).periods
        for (let c = rect.c1 + 1; c <= lastCol; c++) {
          const row = rows[r]
          const col = cols[c]
          if (!row || !col || getCell(r, c).periods === src) continue
          patches.push({ classId: row.classId, subjectId: col.subjectId, weeklyPeriods: src })
        }
      }
      emit(patches)
      return
    }
    if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      const block: number[][] = []
      for (let r = rect.r1; r <= rect.r2; r++) {
        const line: number[] = []
        for (let c = rect.c1; c <= rect.c2; c++) line.push(getCell(r, c).periods)
        block.push(line)
      }
      clipboard.current = block
      return
    }
    if (mod && e.key.toLowerCase() === 'v') {
      e.preventDefault()
      const block = clipboard.current
      if (!block) return
      const patches: MatrixPatch[] = []
      for (let i = 0; i < block.length; i++) {
        for (let j = 0; j < block[i].length; j++) {
          const r = rect.r1 + i
          const c = rect.c1 + j
          const row = rows[r]
          const col = cols[c]
          if (!row || !col) continue
          if (getCell(r, c).periods === block[i][j]) continue
          patches.push({
            classId: row.classId,
            subjectId: col.subjectId,
            weeklyPeriods: block[i][j]
          })
        }
      }
      emit(patches)
      return
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        move(-1, 0, e.shiftKey)
        return
      case 'ArrowDown':
        e.preventDefault()
        move(1, 0, e.shiftKey)
        return
      case 'ArrowLeft':
        e.preventDefault()
        move(0, -1, e.shiftKey)
        return
      case 'ArrowRight':
        e.preventDefault()
        move(0, 1, e.shiftKey)
        return
      case 'Tab':
        e.preventDefault()
        move(0, e.shiftKey ? -1 : 1, false)
        return
      case 'Home':
        e.preventDefault()
        setFocus({ r: focus.r, c: 0 })
        if (!e.shiftKey) setAnchor({ r: focus.r, c: 0 })
        return
      case 'End':
        e.preventDefault()
        setFocus({ r: focus.r, c: cols.length - 1 })
        if (!e.shiftKey) setAnchor({ r: focus.r, c: cols.length - 1 })
        return
      case 'Enter':
      case 'F2':
        e.preventDefault()
        setEditing({
          pos: focus,
          text: String(getCell(focus.r, focus.c).periods || ''),
          fillRange: false
        })
        return
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        fillRange(0, rect.r1, rect.r2, rect.c1, rect.c2)
        return
      case 'Escape':
        e.preventDefault()
        setAnchor(focus)
        return
      default:
        break
    }

    // 直接输入数字 → 进入编辑；若当前是多格选区，提交时整片填入（docs/05「框选批量填充」）
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault()
      const multi = rect.r1 !== rect.r2 || rect.c1 !== rect.c2
      setEditing({ pos: focus, text: e.key, fillRange: multi })
    }
  }

  // ── 鼠标框选 ────────────────────────────────────────────────────────────
  useEffect(() => {
    const up = (): void => {
      dragging.current = false
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const startDrag = (r: number, c: number, e: React.MouseEvent): void => {
    if (e.button !== 0) return
    dragging.current = true
    setFocus({ r, c })
    if (!e.shiftKey) setAnchor({ r, c })
    setEditing(null)
    gridRef.current?.focus()
  }

  const enterCell = (r: number, c: number): void => {
    if (dragging.current) setFocus({ r, c })
  }

  const selectedCells = (): { classId: number; subjectId: number }[] => {
    const out: { classId: number; subjectId: number }[] = []
    for (let r = rect.r1; r <= rect.r2; r++) {
      for (let c = rect.c1; c <= rect.c2; c++) {
        const row = rows[r]
        const col = cols[c]
        if (row && col) out.push({ classId: row.classId, subjectId: col.subjectId })
      }
    }
    return out
  }

  if (rows.length === 0 || cols.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-card border border-[color:var(--border-subtle)] text-sm text-[color:var(--text-secondary)]">
        没有可编辑的班级或学科 —— 请先在「基础数据」页录入
      </div>
    )
  }

  const COL_W = 68
  const HEAD_W = 132

  return (
    <div
      ref={gridRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="relative min-h-[18rem] flex-1 overflow-auto rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] outline-none focus:ring-2 focus:ring-brand-600/40"
    >
      <table className="border-separate border-spacing-0 text-sm" style={{ userSelect: 'none' }}>
        <thead>
          <tr>
            <th
              className="sticky left-0 top-0 z-30 border-b border-r border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-3 py-2 text-left text-xs font-semibold"
              style={{ minWidth: HEAD_W }}
            >
              班级 \ 学科
            </th>
            {cols.map((col, c) => (
              <th
                key={col.subjectId}
                className={cn(
                  'sticky top-0 z-20 border-b border-r border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-1 py-2 text-center text-xs font-semibold',
                  c >= rect.c1 && c <= rect.c2 && 'bg-brand-50 dark:bg-slate-800'
                )}
                style={{ minWidth: COL_W, width: COL_W }}
                title={col.label}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ backgroundColor: col.color }}
                />
                <span className="ml-1 align-middle">{col.label}</span>
              </th>
            ))}
            <th
              className="sticky right-0 top-0 z-30 border-b border-l-2 border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-2 py-2 text-center text-xs font-semibold"
              style={{ minWidth: 76 }}
            >
              行合计
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const over = rowTotals[r] > row.capacity
            const newGroup = r === 0 || rows[r - 1].groupLabel !== row.groupLabel
            return (
              <tr key={row.classId}>
                <th
                  className={cn(
                    'sticky left-0 z-10 border-b border-r border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-3 py-1 text-left text-xs font-medium',
                    newGroup && 'border-t-2 border-t-slate-300 dark:border-t-slate-600',
                    over && 'bg-amber-50 dark:bg-amber-950/40',
                    r >= rect.r1 && r <= rect.r2 && 'text-brand-700 dark:text-brand-100'
                  )}
                  style={{ minWidth: HEAD_W }}
                >
                  <div className="truncate" title={`${row.groupLabel} · ${row.label}`}>
                    {row.label}
                  </div>
                </th>
                {cols.map((col, c) => {
                  const v = getCell(r, c)
                  const isFocus = focus.r === r && focus.c === c
                  const isSel = inRect(r, c)
                  const isEditing = editing != null && editing.pos.r === r && editing.pos.c === c
                  return (
                    <td
                      key={col.subjectId}
                      ref={isFocus ? focusCellRef : undefined}
                      onMouseDown={(e) => startDrag(r, c, e)}
                      onMouseEnter={() => enterCell(r, c)}
                      onDoubleClick={() =>
                        setEditing({
                          pos: { r, c },
                          text: String(v.periods || ''),
                          fillRange: false
                        })
                      }
                      className={cn(
                        'relative border-b border-r border-[color:var(--border-subtle)] p-0 align-top transition-colors',
                        newGroup && 'border-t-2 border-t-slate-300 dark:border-t-slate-600',
                        over && 'bg-amber-50/60 dark:bg-amber-950/20',
                        isSel && 'bg-brand-50 dark:bg-slate-800',
                        isFocus && 'outline outline-2 -outline-offset-2 outline-brand-600'
                      )}
                      style={{ minWidth: COL_W, width: COL_W }}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          value={editing.text}
                          inputMode="numeric"
                          onChange={(e) =>
                            setEditing({ ...editing, text: e.target.value.replace(/[^\d]/g, '') })
                          }
                          onBlur={() => commitEdit('none')}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commitEdit('down')
                            } else if (e.key === 'Tab') {
                              e.preventDefault()
                              commitEdit('right')
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              setEditing(null)
                              gridRef.current?.focus()
                            }
                          }}
                          className="h-[42px] w-full bg-white px-1 text-center text-sm font-semibold text-[color:var(--text-primary)] outline-none dark:bg-slate-900"
                        />
                      ) : (
                        <div className="flex h-[42px] flex-col">
                          <div
                            className={cn(
                              'flex h-[24px] items-center justify-center text-sm font-semibold tabular-nums',
                              v.periods === 0 && 'text-slate-300 dark:text-slate-600'
                            )}
                          >
                            {v.periods === 0 ? '–' : v.periods}
                          </div>
                          <button
                            type="button"
                            tabIndex={-1}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation()
                              setFocus({ r, c })
                              setAnchor({ r, c })
                              onAssignTeacher([{ classId: row.classId, subjectId: col.subjectId }])
                            }}
                            className={cn(
                              'h-[18px] w-full truncate border-t border-dashed border-[color:var(--border-subtle)] px-0.5 text-[10px] leading-[18px] transition-colors hover:bg-brand-100 dark:hover:bg-slate-700',
                              v.teacherId == null
                                ? 'text-slate-300 dark:text-slate-600'
                                : 'text-[color:var(--text-secondary)]'
                            )}
                            title={
                              v.teacherId == null
                                ? '点击指派教师'
                                : `${teacherName(v.teacherId)} · 点击更换`
                            }
                          >
                            {v.periods === 0
                              ? ''
                              : v.teacherId == null
                                ? '待指派'
                                : teacherName(v.teacherId)}
                          </button>
                        </div>
                      )}
                    </td>
                  )
                })}
                <td
                  className={cn(
                    'sticky right-0 z-10 border-b border-l-2 border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-2 text-center text-sm font-semibold tabular-nums',
                    newGroup && 'border-t-2 border-t-slate-300 dark:border-t-slate-600',
                    over
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                      : 'text-[color:var(--text-secondary)]'
                  )}
                  title={over ? `超出本学段一周可排 ${row.capacity} 节` : `可排 ${row.capacity} 节`}
                >
                  {rowTotals[r]}
                  <span className="ml-0.5 text-[10px] font-normal opacity-60">/{row.capacity}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th className="sticky bottom-0 left-0 z-30 border-r border-t-2 border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-3 py-2 text-left text-xs font-semibold">
              列合计
            </th>
            {cols.map((col, c) => (
              <td
                key={col.subjectId}
                className={cn(
                  'sticky bottom-0 z-20 border-r border-t-2 border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-1 py-2 text-center text-xs font-semibold tabular-nums',
                  c >= rect.c1 && c <= rect.c2 && 'bg-brand-50 dark:bg-slate-800'
                )}
              >
                {colTotals[c]}
              </td>
            ))}
            <td className="sticky bottom-0 right-0 z-30 border-l-2 border-t-2 border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-2 py-2 text-center text-xs font-bold tabular-nums">
              {grandTotal}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* 选区状态条 */}
      <div className="pointer-events-none sticky bottom-0 left-0 z-40 flex justify-end">
        <div className="pointer-events-auto m-2 rounded-btn bg-slate-900/85 px-2.5 py-1 text-[11px] text-white shadow-md">
          选中 {rect.r2 - rect.r1 + 1}×{rect.c2 - rect.c1 + 1} 格
          <button
            type="button"
            className="ml-2 underline underline-offset-2 hover:text-brand-100"
            onClick={() => onAssignTeacher(selectedCells())}
          >
            批量指派教师
          </button>
        </div>
      </div>
    </div>
  )
}
