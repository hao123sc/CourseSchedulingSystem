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
  calculatePosterMetrics,
  renderCampusOverviewPosterPreview,
  exportCampusOverviewPosterBinary,
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
  const [scale, setScale] = useState<number>(3)
  const [format, setFormat] = useState<'png' | 'jpeg'>('png')
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
  const [exportStatus, setExportStatus] = useState<string>('')
  const [previewResult, setPreviewResult] = useState<PosterRenderResult | null>(null)
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
  }, [
    open,
    versionId,
    stageId,
    stageName,
    schoolName,
    semesterName,
    versionName,
    classes,
    grades,
    slots,
    lessons,
    fixedLessons,
    subjects,
    teachers,
    classrooms
  ])

  // 计算当前选定参数下的导出目标尺寸
  const targetMetrics = useMemo(() => {
    if (!overviewSheet) return null
    const options: PosterOptions = {
      theme,
      customTitle,
      customSubTitle,
      showLegend,
      showSignatures,
      signatoryText
    }
    return calculatePosterMetrics(overviewSheet, options, scale)
  }, [overviewSheet, scale, theme, customTitle, customSubTitle, showLegend, showSignatures, signatoryText])

  // 快速生成海报实时预览（轻量 1x，不随 scale 切换而卡顿或耗尽内存）
  useEffect(() => {
    if (!open || !overviewSheet) return

    const seq = ++renderSeq.current
    setRendering(true)

    const timer = setTimeout(() => {
      const options: PosterOptions = {
        theme,
        customTitle,
        customSubTitle,
        showLegend,
        showSignatures,
        signatoryText
      }

      renderCampusOverviewPosterPreview(overviewSheet, options)
        .then((res) => {
          if (seq === renderSeq.current) {
            setPreviewResult(res)
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
    }, 120)

    return () => clearTimeout(timer)
  }, [open, overviewSheet, theme, customTitle, customSubTitle, showLegend, showSignatures, signatoryText])

  const handleExportPoster = async (): Promise<void> => {
    if (!overviewSheet || !targetMetrics) return

    setExporting(true)
    setExportStatus(`正在生成 ${targetMetrics.widthPx} × ${targetMetrics.heightPx} 像素超高分辨率图像...`)

    try {
      // 导出使用选定的分辨率和格式生成二进制 ArrayBuffer
      const options: PosterOptions = {
        scale,
        format,
        jpegQuality: 0.95,
        theme,
        customTitle,
        customSubTitle,
        showLegend,
        showSignatures,
        signatoryText
      }

      const binaryResult = await exportCampusOverviewPosterBinary(overviewSheet, options)
      setExportStatus(`正在保存图像文件 (${(binaryResult.sizeBytes / 1024 / 1024).toFixed(2)} MB)...`)

      const dpiLabel =
        scale === 1
          ? '96DPI'
          : scale === 1.5
          ? '150DPI'
          : scale === 2
          ? '200DPI_高清'
          : scale === 3
          ? '300DPI_广告喷绘级'
          : '400DPI_巨幅印刷'

      const ext = binaryResult.mimeType.includes('jpeg') ? 'jpg' : 'png'
      const defaultName = `${schoolName}_${semesterName}_${stageName || '全校'}总课表_大幅海报_${dpiLabel}.${ext}`

      const res = await api['timetable:savePosterImage']({
        defaultName,
        buffer: binaryResult.buffer,
        mimeType: binaryResult.mimeType
      })

      if (res.canceled) {
        toast.info('已取消保存')
      } else if (res.error) {
        toast.error(`保存失败: ${res.error}`)
      } else {
        const sizeMb = (binaryResult.sizeBytes / 1024 / 1024).toFixed(2)
        toast.success(
          `大幅面海报图片导出成功！分辨率：${binaryResult.width}×${binaryResult.height}px，大小：${sizeMb} MB，保存至：${res.filePath}`
        )
        onClose()
      }
    } catch (err) {
      toast.error(`导出海报图片失败: ${String(err)}`)
    } finally {
      setExporting(false)
      setExportStatus('')
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !exporting && onClose()}
      title="🖼️ 导出大幅面海报图片（广告公司打印）"
      description="为全校总课表生成高分辨率海报图像，支持 150~300 DPI 大幅面喷绘、校门口展板与教务大厅张贴。"
      className="max-w-4xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            取消
          </Button>
          <Button
            onClick={handleExportPoster}
            disabled={exporting || rendering || !overviewSheet}
            className="gap-2 bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500"
          >
            {exporting
              ? exportStatus || '正在导出…'
              : `📥 导出大幅面海报 (${targetMetrics ? `${targetMetrics.widthPx}×${targetMetrics.heightPx} px` : '高精'})`}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* 左侧：排版与印刷参数设置 */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="rounded-card border border-[color:var(--border-subtle)] bg-[color:var(--surface)] p-3.5">
            <h4 className="text-xs font-semibold text-[color:var(--text-1)]">印刷规格与分辨率</h4>
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-medium text-[color:var(--text-2)]">
                  输出清晰度 / DPI 级别
                </label>
                <Select
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="mt-1"
                >
                  <option value={1}>1.0x (96 DPI · 网页/电子班牌查看)</option>
                  <option value={1.5}>1.5x (150 DPI · 普通清晰度打印)</option>
                  <option value={2}>2.0x (200 DPI · 建议 1~1.5m 展板喷绘)</option>
                  <option value={3}>3.0x (300 DPI · 广告公司专业印刷级 · 巨幅喷绘)</option>
                  <option value={4}>4.0x (400 DPI · 超巨幅 2~3m 展板印刷)</option>
                </Select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-[color:var(--text-2)]">
                  图片文件格式
                </label>
                <Select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as 'png' | 'jpeg')}
                  className="mt-1"
                >
                  <option value="png">PNG 无损格式 (超清印刷 · 适合 1x~3x · 推荐)</option>
                  <option value="jpeg">JPEG 高画质 95% (极速生成 · 适合 4x 超大巨幅)</option>
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
                  placeholder="全校总课表横幅标题"
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-[color:var(--text-2)]">副标题 / 备注信息</label>
                <Input
                  value={customSubTitle}
                  onChange={(e) => setCustomSubTitle(e.target.value)}
                  placeholder="例：排课版本：2026春季正式版"
                  className="mt-1"
                />
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 text-xs text-[color:var(--text-1)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showLegend}
                    onChange={(e) => setShowLegend(e.target.checked)}
                    className="rounded border-[color:var(--border-subtle)]"
                  />
                  包含学科配色图例（方便师生快速识读各学科）
                </label>
                <label className="flex items-center gap-2 text-xs text-[color:var(--text-1)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSignatures}
                    onChange={(e) => setShowSignatures(e.target.checked)}
                    className="rounded border-[color:var(--border-subtle)]"
                  />
                  包含教务审核与校长签批栏
                </label>
              </div>

              {showSignatures && (
                <div>
                  <label className="text-[11px] font-medium text-[color:var(--text-2)]">签批栏文案</label>
                  <Input
                    value={signatoryText}
                    onChange={(e) => setSignatoryText(e.target.value)}
                    className="mt-1 text-xs"
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
            {targetMetrics && (
              <div className="flex items-center gap-2">
                <Badge tone="slate" className="text-[11px] font-mono">
                  {targetMetrics.widthPx} × {targetMetrics.heightPx} px
                </Badge>
                <Badge tone="green" className="text-[11px]">
                  {targetMetrics.estimatedPrintSize}
                </Badge>
              </div>
            )}
          </div>

          <div className="relative flex h-[380px] w-full items-center justify-center overflow-auto rounded-lg border border-[color:var(--border-subtle)] bg-slate-900/10 p-2 shadow-inner dark:bg-slate-950/40">
            {rendering && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-xs dark:bg-slate-900/70">
                <div className="flex items-center gap-2 text-xs font-medium text-brand-600 dark:text-brand-400">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                  正在更新海报排版预览…
                </div>
              </div>
            )}

            {previewResult?.dataUrl ? (
              <img
                src={previewResult.dataUrl}
                alt="全校总课表海报预览"
                className="max-h-full max-w-full rounded object-contain shadow-md"
              />
            ) : (
              <div className="text-center text-xs text-[color:var(--text-3)]">
                正在组装总课表排版数据…
              </div>
            )}
          </div>

          <div className="rounded-card border border-brand-200 bg-brand-50/50 p-3 text-xs text-brand-800 dark:border-brand-900/50 dark:bg-brand-950/30 dark:text-brand-300">
            <div className="font-medium">💡 广告公司喷绘打印指南：</div>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-[color:var(--text-2)]">
              <li>
                <strong>展板/橱窗张贴：</strong>推荐选择 <strong>3.0x (300 DPI)</strong> 或 <strong>4.0x (400 DPI)</strong>，输出超高分辨率点阵，字体锐利清晰。
              </li>
              <li>
                <strong>大幅面文件格式：</strong>如果班级较多（超过 30 班），选择 <strong>PNG</strong> 或 <strong>JPEG 高画质 95%</strong> 均可，已内置内存防溢出与二进制无损直传通道。
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  )
}
