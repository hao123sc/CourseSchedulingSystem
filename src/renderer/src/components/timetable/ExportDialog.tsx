import { useState } from 'react'
import { Modal } from '@renderer/components/ui/modal'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/stores/toastStore'
import { cn } from '@renderer/lib/utils'
import type { TimetableExportScope } from '@shared/types/ipc'
import type { TTView } from '@renderer/pages/Timetable/timetableModel'

interface ExportDialogProps {
  open: boolean
  onClose: () => void
  semesterId: number
  versionId: number | null
  versionName?: string
  stageId: number | null
  stageName?: string
  view: TTView
  targetId: number | null
  targetName?: string
}

export function ExportDialog({
  open,
  onClose,
  semesterId,
  versionId,
  versionName,
  stageId,
  stageName,
  view,
  targetId,
  targetName
}: ExportDialogProps): React.JSX.Element | null {
  const [scope, setScope] = useState<TimetableExportScope>('current')
  const [format, setFormat] = useState<'xlsx' | 'pdf'>('xlsx')
  const [exporting, setExporting] = useState(false)

  const viewLabel =
    view === 'class'
      ? '班级课表'
      : view === 'teacher'
        ? '教师课表'
        : view === 'room'
          ? '教室课表'
          : '全校总表'

  const currentEntityDesc = targetName ? `（${targetName}）` : ''

  const scopeOptions: { key: TimetableExportScope; title: string; desc: string }[] = [
    {
      key: 'current',
      title: `当前${viewLabel}${currentEntityDesc}`,
      desc: `导出当前页面正在查看的${viewLabel}单张工作表`
    },
    {
      key: 'all_classes',
      title: `批量导出班级课表（${stageName || '当前学段'}）`,
      desc: '将当前学段所有班级课表分别导出为独立的工作表（多 Sheet）'
    },
    {
      key: 'all_teachers',
      title: '批量导出教师课表（全校）',
      desc: '将全校所有启用教师的个人课表分别导出为独立的工作表'
    },
    {
      key: 'all_rooms',
      title: '批量导出教室课表（全校）',
      desc: '将全校所有教室场地的课表分别导出为独立的工作表'
    },
    {
      key: 'overview',
      title: `导出总课表（${stageName || '当前学段'}）`,
      desc: '导出包含全学段所有班级与时段的横向全景总课表'
    }
  ]

  const handleExport = async (): Promise<void> => {
    if (versionId == null) {
      toast.error('当前无可用排课版本')
      return
    }

    if (format === 'pdf') {
      toast.info('PDF 打印导出将在后续阶段增强，请先使用 Excel 导出')
      return
    }

    setExporting(true)
    try {
      const res = await api['timetable:exportExcel']({
        semesterId,
        versionId,
        stageId,
        view,
        targetId,
        scope
      })

      if (res.canceled) {
        toast.info('已取消导出')
      } else {
        toast.success(`导出成功！已保存至 ${res.filePath}（包含 ${res.count} 张工作表）`)
        onClose()
      }
    } catch (err) {
      toast.error(`导出失败：${String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !exporting && onClose()}
      title="课表导出"
      description="选择导出范围与文件格式，将课表保存至本地 Excel 文件"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={exporting}>
            取消
          </Button>
          <Button onClick={handleExport} disabled={exporting || versionId == null}>
            {exporting ? '正在导出…' : '开始导出 (Excel)'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-xs">
        {/* 当前版本与筛选提示 */}
        <div className="rounded-btn border border-[color:var(--border-subtle)] bg-[color:var(--panel-2)] p-3">
          <div className="grid grid-cols-2 gap-2 text-[11.5px]">
            <div>
              <span className="text-[color:var(--text-3)]">排课版本：</span>
              <span className="font-medium text-[color:var(--text)]">
                {versionName || '当前版本'}
              </span>
            </div>
            <div>
              <span className="text-[color:var(--text-3)]">当前学段：</span>
              <span className="font-medium text-[color:var(--text)]">
                {stageName || '默认学段'}
              </span>
            </div>
            <div>
              <span className="text-[color:var(--text-3)]">当前视图：</span>
              <span className="font-medium text-[color:var(--text)]">{viewLabel}</span>
            </div>
            <div>
              <span className="text-[color:var(--text-3)]">目标实体：</span>
              <span className="font-medium text-[color:var(--text)]">
                {targetName || '全选/默认'}
              </span>
            </div>
          </div>
        </div>

        {/* 导出范围选择 */}
        <div>
          <label className="mb-1.5 block font-medium text-[color:var(--text)]">导出范围</label>
          <div className="flex flex-col gap-2">
            {scopeOptions.map((opt) => (
              <label
                key={opt.key}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-card border p-2.5 transition-colors',
                  scope === opt.key
                    ? 'border-brand-600 bg-brand-50/50 dark:border-brand-500 dark:bg-brand-500/10'
                    : 'border-[color:var(--border-subtle)] bg-[color:var(--panel)] hover:bg-[color:var(--panel-2)]'
                )}
              >
                <input
                  type="radio"
                  name="exportScope"
                  checked={scope === opt.key}
                  onChange={() => setScope(opt.key)}
                  className="mt-0.5 accent-brand-600"
                />
                <div className="flex-1">
                  <div className="font-medium text-[color:var(--text)]">{opt.title}</div>
                  <div className="text-[11px] text-[color:var(--text-3)]">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 格式选择 */}
        <div>
          <label className="mb-1.5 block font-medium text-[color:var(--text)]">导出格式</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormat('xlsx')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-btn border py-2 font-medium transition-colors',
                format === 'xlsx'
                  ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'border-[color:var(--border-subtle)] bg-[color:var(--panel)] text-[color:var(--text-2)] hover:bg-[color:var(--panel-2)]'
              )}
            >
              <span>📊</span>
              <span>Excel 工作簿 (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => setFormat('pdf')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-btn border py-2 font-medium transition-colors opacity-70',
                format === 'pdf'
                  ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'border-[color:var(--border-subtle)] bg-[color:var(--panel)] text-[color:var(--text-2)] hover:bg-[color:var(--panel-2)]'
              )}
            >
              <span>📄</span>
              <span>PDF 文档 (.pdf)</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
