import * as React from 'react'
import type { SingleTimetableExportSheet } from '@shared/timetableExport'
import { cn } from '@renderer/lib/utils'

export interface PrintableTimetableSheetProps {
  sheet: SingleTimetableExportSheet
  schoolName?: string
  semesterName?: string
  versionName?: string
  showTimeRange?: boolean
  showSubInfo?: boolean
  showSignatures?: boolean
  showStats?: boolean
  colorMode?: 'clean' | 'subtle' | 'mono'
  customHeader?: string
  customFooter?: string
  paperSize?: 'A4' | 'A3'
  orientation?: 'landscape' | 'portrait'
  className?: string
  isInteractivePreview?: boolean
}

export function PrintableTimetableSheet({
  sheet,
  schoolName = '学校',
  semesterName = '本学期',
  versionName = '正式课表',
  showTimeRange = true,
  showSubInfo = true,
  showSignatures = true,
  showStats = true,
  colorMode = 'subtle',
  customHeader,
  customFooter,
  paperSize = 'A4',
  orientation = 'landscape',
  className,
  isInteractivePreview = false
}: PrintableTimetableSheetProps): React.JSX.Element {
  const mainHeader = customHeader?.trim() || `${schoolName} · ${semesterName}`
  const sheetSubTitle = sheet.title || `${sheet.targetName} 课程表`
  const signatoryText =
    customFooter?.trim() ||
    '班主任/教师签名：________________    教务处审核：________________    校长审批：________________'

  const days = sheet.days.length > 0 ? sheet.days : [1, 2, 3, 4, 5]

  return (
    <div
      className={cn(
        'print-page-sheet flex flex-col justify-between bg-white text-slate-900',
        orientation === 'landscape' ? 'print-landscape' : 'print-portrait',
        isInteractivePreview ? 'rounded-lg border border-slate-300 p-6 shadow-md' : 'p-4',
        className
      )}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
        minHeight: isInteractivePreview ? '520px' : 'auto'
      }}
    >
      {/* ── 顶部标题区 ── */}
      <div className="mb-2 shrink-0 border-b-2 border-slate-800 pb-2 text-center">
        <h1 className="text-base font-bold tracking-wide text-slate-900 sm:text-lg">
          {mainHeader}
        </h1>
        <h2 className="mt-0.5 text-sm font-semibold text-slate-800 sm:text-base">
          {sheetSubTitle}
        </h2>
        <div className="mt-1 flex flex-wrap items-center justify-between text-[11px] text-slate-600">
          <div>
            <span>方案版本：</span>
            <span className="font-medium text-slate-800">{versionName}</span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              {sheet.viewType === 'class' ? '班级' : sheet.viewType === 'teacher' ? '教师' : '教室'}
              ：<strong className="text-slate-900">{sheet.targetName}</strong>
            </span>
            <span>打印日期：{new Date().toLocaleDateString('zh-CN')}</span>
          </div>
        </div>
      </div>

      {/* ── 主体课表格子 ── */}
      <div className="min-h-0 flex-1">
        <table className="w-full h-full border-collapse border border-slate-700 text-center text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className="w-20 border border-slate-700 px-1 py-1.5 font-semibold text-slate-800">
                节次 / 时间
              </th>
              {days.map((day) => (
                <th
                  key={day}
                  className="border border-slate-700 px-1 py-1.5 font-semibold text-slate-800"
                >
                  {sheet.dayNames[day] ?? `星期${day}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row) => (
              <React.Fragment key={row.periodIndex}>
                {row.dividerBefore && (
                  <tr className="bg-slate-100/80">
                    <td
                      colSpan={days.length + 1}
                      className="border border-slate-700 py-0.5 text-center text-[10.5px] font-medium tracking-widest text-slate-600"
                    >
                      {row.dividerBefore}
                    </td>
                  </tr>
                )}
                <tr className="min-h-[44px]">
                  <td className="border border-slate-700 bg-slate-50/70 p-1 text-center">
                    <div className="font-semibold text-slate-800">{row.periodName}</div>
                    {showTimeRange && row.timeRange && (
                      <div className="text-[10px] text-slate-500">{row.timeRange}</div>
                    )}
                  </td>
                  {days.map((day) => {
                    const cell = row.cellsByDay.get(day)
                    const items = cell?.items ?? []
                    return (
                      <td
                        key={day}
                        className="border border-slate-700 p-1 text-left align-top transition-colors"
                      >
                        {items.length === 0 ? (
                          <div className="h-full min-h-[36px]" />
                        ) : (
                          <div className="flex flex-col gap-1">
                            {items.map((item, idx) => {
                              const bgStyle =
                                colorMode === 'subtle' && item.color
                                  ? {
                                      backgroundColor: `${item.color}15`,
                                      borderLeft: `3px solid ${item.color}`
                                    }
                                  : colorMode === 'mono'
                                    ? { borderLeft: '2px solid #475569' }
                                    : {}

                              return (
                                <div
                                  key={idx}
                                  style={bgStyle}
                                  className={cn(
                                    'rounded-[3px] p-1 text-xs',
                                    colorMode === 'clean' && 'border border-slate-200 bg-slate-50'
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-900">
                                      {item.subjectName}
                                    </span>
                                    {item.isLocked && (
                                      <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-800">
                                        预排
                                      </span>
                                    )}
                                  </div>
                                  {showSubInfo && (
                                    <div className="mt-0.5 text-[10.5px] text-slate-600">
                                      {sheet.viewType === 'class' && (
                                        <span>
                                          {[item.teacherName, item.roomName]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </span>
                                      )}
                                      {sheet.viewType === 'teacher' && (
                                        <span>
                                          {[item.className, item.roomName]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </span>
                                      )}
                                      {sheet.viewType === 'room' && (
                                        <span>
                                          {[item.className, item.teacherName]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 底部统计与审批签字区 ── */}
      <div className="mt-2 shrink-0 border-t border-slate-600 pt-2 text-[11px] text-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {showStats ? (
            <div className="flex items-center gap-3">
              <span>
                周正课节数：<strong>{sheet.stats.totalLessons} 节</strong>
              </span>
              {sheet.stats.lockedLessons > 0 && (
                <span>（预排锁定 {sheet.stats.lockedLessons} 节）</span>
              )}
              {sheet.stats.consecutiveCount > 0 && (
                <span>（连堂 {sheet.stats.consecutiveCount} 节）</span>
              )}
            </div>
          ) : (
            <div />
          )}
          <div className="text-[10px] text-slate-500">
            智课排智能排课系统 · {paperSize} {orientation === 'landscape' ? '横向' : '纵向'}
          </div>
        </div>

        {showSignatures && (
          <div className="mt-2 text-center text-xs text-slate-800 font-medium">{signatoryText}</div>
        )}
      </div>
    </div>
  )
}
