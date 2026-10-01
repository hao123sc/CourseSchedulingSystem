import { useState, useEffect, useMemo, useRef } from 'react'
import { Modal } from '@renderer/components/ui/modal'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/stores/toastStore'
import {
  buildOverviewExportSheet,
  type ExportMetaContext
} from '@shared/timetableExport'
import {
  renderCampusOverviewPoster,
  type PosterOptions,
  type PosterRenderResult
} from '@renderer/lib/posterGenerator'
import type {
  Classroom,
  FixedLesson,
  Grade,
  Klass,
  Lesson,
  Subject,
  Teacher,
  TimeSlot
} from '@shared/types/entities'

interface PosterExportModalProps {
  open: boolean
  onClose: () => void
  semesterId: number
  versionId: number | null
  stageId?: number | null
  stageName?: string
  schoolName?: string
  semesterName?: string
  versionName?: string
  classes: Klass[]
  grades: Grade[]
  slots: TimeSlot[]
  lessons: Lesson[]
  fixedLessons: FixedLesson[]
  subjects: Subject[]
  teachers: Teacher[]
  classrooms: Classroom[]
}

export function PosterExportModal({
  open,
  onClose,
  versionId,
  stageId,
  stageName,
  schoolName = '学校',
  semesterName = '本学期',
  versionName = '当前方案',
  classes,
  grades,
  slots,
  lessons,
  fixedLessons,
  subjects,
  teachers,
  classrooms
}: PosterExportModalProps): React.JSX.Element | null {
  const [scale, setScale] = useState<number>(2)
  const [theme, setTheme] = useState<'modern' | 'blue' | 'classic'>('modern')
  const [customTitle, setCustomTitle] = useState('')
  const [customSubTitle, setCustomSubTitle] = useState('')
  const [showLegend, setShowLegend] = useState(true)
  const [showSignatures, setShowSignatures] = useState(true)
  const [signatoryText, setSignatoryText] = useState(
    '教务处制表：________________    分管校长审批：________________    公布日期：2026年___月___日'
  )

  const [rendering, setRendering] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [renderResult, setRenderResult] = useState<PosterRenderResult | null>(null)
  const renderSeq = useRef(0)

  // 默认标题
  useEffect(() => {
    if (open) {
      setCustomTitle(`【${schoolName}】${semesterName} ${stageName || '全校'}总课表`)
      setCustomSubTitle(`排课版本：${versionName}  ·  编制部门：教务处`)
    }
  }, [open, schoolName, semesterName, stageName, versionName])

  // 组装总表数据模型
  const overviewSheet = useMemo(() => {
    if (!open || versionId == null) return null

    const stageGradeIds = stageId != null
      ? new Set(grades.filter((g) => g.stageId === stageId).map((g) => g.id))
      : null

    const stageClasses = stageGradeIds
      ? classes.filter((c) => stageGradeIds.has(c.gradeId))
      : classes

    const metaContext: ExportMetaContext = {
      schoolName,
      semesterName,
      versionName,
      stageName,
      subjects,
      teachers,
      classrooms,
      classes,
      grades
    }

    return buildOverviewExportSheet({
      slots,
      stageClasses: stageClasses.length > 0 ? stageClasses : classes,
      grades,
      lessons,
      fixedLessons,
      meta: metaContext
    })
  }, [open, versionId, stageId, stageName, schoolName, semesterName, versionName, classes, grades, slots, lessons, fixedLessons, subjects, teachers, classrooms])

  // 重新渲染海报（防抖渲染预览）
  useEffect(() => {
    if (!open || !overviewSheet) return

    const seq = ++renderSeq.current
    setRendering(true)

    const timer = setTimeout(() => {
      const options: PosterOptions = {
        scale,
        theme,
        customTitle,
        customSubTitle,
        showLegend,
        showSignatures,
        signatoryText
      }

      renderCampusOverviewPoster(overviewSheet, options)
        .then((res) => {
          if (seq === renderSeq.current) {
            setRenderResult(res)
          }
        })
        .catch((err) => {
          if (seq === renderSeq.current) {
            toast.error(`生成海报预览失败: ${String(err)}`)
          }
        })
        .finally(() => {
          if (seq === renderSeq.current) setRendering(false)
        })
    }, 150)

    return () => clearTimeout(timer)
  }, [open, overviewSheet, scale, theme, customTitle, customSubTitle, showLegend, showSignatures, signatoryText])

  const handleExportPoster = async (): Promise<void> => {
    if (!overviewSheet) return

    setExporting(true)
    try {
      // 导出时使用选定的分辨率重新生成高精度图像
      const options: PosterOptions = {
        scale,
        theme,
        customTitle,
        customSubTitle,
        showLegend,
        showSignatures,
        signatoryText
      }
      const fullRes = await renderCampusOverviewPoster(overviewSheet, options)

      const dpiLabel = scale === 1 ? '72DPI' : scale === 2 ? '150DPI' : scale === 3 ? '300DPI_广告喷绘级' : '400DPI_超大巨幅'
      const defaultName = `${schoolName}_${semesterName}_${stageName || '全校'}总课表_大幅海报_${dpiLabel}.png`

      const res = await api['timetable:savePosterImage']({
        defaultName,
        base64Data: fullRes.dataUrl
      })

      if (res.canceled) {
        toast.info('已取消保存')
      } else {
        toast.success(`大幅面海报图片导出成功！已保存至：${res.filePath}`)
        onClose()
      }
    } catch (err) {
      toast.error(`导出海报图片失败: ${String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !exporting && onClose()}
      title="🖼️ 导出大幅面海报图片（广告公司打印）"
      description="为全校总课表生成超高分辨率海报图像，支持 150~300 DPI 大幅面喷绘、校门口与教务大厅展板张贴。"
      className="max-w-4xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            取消
          </Button>
          <Button
            onClick={handleExportPoster}
            disabled={exporting || rendering || !renderResult}
            className="gap-2 bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500"
          >
            {exporting ? '正在生成并保存…' : '📥 导出高清海报图片 (PNG)'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 左侧：排版与规格配置 */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--surface)] p-3.5">
            <h4 className="text-xs font-semibold text-[color:var(--text-1)]">分辨率与喷绘规格</h4>
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-medium text-[color:var(--text-2)]">
                  输出精度（广告公司要求）
                </label>
                <Select
                  value={String(scale)}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="mt-1"
                >
                  <option value="1">1x 标清预览（72 DPI · 适合手机/网页传阅）</option>
                  <option value="2">2x 高清打印（150 DPI · 适合 A3/A2 纸张彩印）</option>
                  <option value="3">3x 广告喷绘超清（300 DPI · 适合 1.5~2.5米 展板张贴，推荐）</option>
                  <option value="4">4x 巨幅海报（400 DPI · 适合 3米以上 巨幅校园展板）</option>
                </Select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-[color:var(--text-2)]">
                  色彩主题风格
                </label>
                <Select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as 'modern' | 'blue' | 'classic')}
                  className="mt-1"
                >
                  <option value="modern">现代深紫彩印（对比鲜明 · 推荐）</option>
                  <option value="blue">典雅商务海蓝（庄重稳健）</option>
                  <option value="classic">极简黑白灰（清爽耐看）</option>
                </Select>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--surface)] p-3.5">
            <h4 className="text-xs font-semibold text-[color:var(--text-1)]">海报横幅与署名设置</h4>
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-medium text-[color:var(--text-2)]">大标题</label>
                <Input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="请输入海报顶部大标题"
                  className="mt-1 h-8 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-[color:var(--text-2)]">副标题 / 编制说明</label>
                <Input
                  value={customSubTitle}
                  onChange={(e) => setCustomSubTitle(e.target.value)}
                  placeholder="例如：2026年秋季学期 · 教务处核定"
                  className="mt-1 h-8 text-xs"
                />
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={showLegend}
                    onChange={(e) => setShowLegend(e.target.checked)}
                    className="rounded text-brand-600"
                  />
                  <span>包含底部学科颜色对照图例</span>
                </label>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={showSignatures}
                    onChange={(e) => setShowSignatures(e.target.checked)}
                    className="rounded text-brand-600"
                  />
                  <span>包含教务审核与校长审批签名栏</span>
                </label>
              </div>

              {showSignatures && (
                <div>
                  <label className="text-[11px] font-medium text-[color:var(--text-2)]">
                    签名栏文字
                  </label>
                  <Input
                    value={signatoryText}
                    onChange={(e) => setSignatoryText(e.target.value)}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：实时渲染缩略图与尺寸信息 */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[color:var(--text-1)]">海报预览</span>
            {renderResult && (
              <div className="flex items-center gap-2">
                <Badge tone="slate" className="text-[11px] font-mono">
                  {renderResult.width} × {renderResult.height} px
                </Badge>
                <Badge tone="green" className="text-[11px]">
                  {renderResult.estimatedPrintSize}
                </Badge>
              </div>
            )}
          </div>

          <div className="relative flex h-[360px] w-full items-center justify-center overflow-auto rounded-lg border border-[color:var(--border-subtle)] bg-slate-900/10 p-2 shadow-inner dark:bg-slate-950/40">
            {rendering && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-xs dark:bg-slate-900/70">
                <span className="text-xs font-medium text-brand-600">正在生成高精度海报…</span>
              </div>
            )}

            {renderResult ? (
              <img
                src={renderResult.dataUrl}
                alt="总课表海报预览"
                className="max-h-full max-w-full rounded border border-white/40 object-contain shadow-md"
              />
            ) : (
              <div className="text-xs text-[color:var(--text-3)]">正在准备预览数据…</div>
            )}
          </div>

          <div className="rounded-md bg-blue-50/70 p-2.5 text-[11px] leading-4 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
            💡 <strong>印刷小贴士：</strong>
            全校总课表班级数较多时，建议选择 <strong>3x (300 DPI)</strong> 导出 PNG 文件直接发送给广告喷绘制作公司。导出的海报内置标准四色高对比调色板与教务签名栏，喷绘制作 2~3 米大幅展板时字体依然清晰锐利。
          </div>
        </div>
      </div>
    </Modal>
  )
}
