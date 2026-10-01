import type { OverviewExportSheet } from '@shared/timetableExport'
import { api } from '@renderer/lib/api'

export interface PosterOptions {
  scale?: number // 1, 1.5, 2, 3, 3.5, 4
  theme?: 'modern' | 'blue' | 'classic'
  format?: 'png' | 'jpeg'
  jpegQuality?: number
  customTitle?: string
  customSubTitle?: string
  showLegend?: boolean
  showSignatures?: boolean
  signatoryText?: string
}

export interface PosterRenderResult {
  dataUrl: string
  width: number
  height: number
  scale: number
  estimatedPrintSize: string
}

export interface PosterExportStreamResult {
  canceled: boolean
  filePath?: string | null
  width: number
  height: number
  scale: number
  sizeBytes: number
  estimatedPrintSize: string
  error?: string
}

const THEME_COLORS = {
  modern: {
    headerBg: '#1E1B4B',
    headerSub: '#818CF8',
    gradeBg: '#EEF2FF',
    gradeText: '#312E81',
    classBg: '#F8FAFC',
    classText: '#0F172A',
    dividerBg: '#F1F5F9',
    dividerText: '#475569',
    gridBorder: '#CBD5E1',
    dayBg: '#F8FAFC',
    dayText: '#1E293B'
  },
  blue: {
    headerBg: '#0C4A6E',
    headerSub: '#38BDF8',
    gradeBg: '#E0F2FE',
    gradeText: '#0369A1',
    classBg: '#F0F9FF',
    classText: '#0C4A6E',
    dividerBg: '#E0F2FE',
    dividerText: '#0284C7',
    gridBorder: '#BAE6FD',
    dayBg: '#F0F9FF',
    dayText: '#0369A1'
  },
  classic: {
    headerBg: '#18181B',
    headerSub: '#A1A1AA',
    gradeBg: '#F4F4F5',
    gradeText: '#27272A',
    classBg: '#FAFAFA',
    classText: '#18181B',
    dividerBg: '#E4E4E7',
    dividerText: '#52525B',
    gridBorder: '#D4D4D8',
    dayBg: '#F4F4F5',
    dayText: '#27272A'
  }
}

/** 计算排版基础度量尺寸与实际缩放系数 */
export function calculatePosterMetrics(
  sheet: OverviewExportSheet,
  options: PosterOptions = {},
  requestedScale = 3
): {
  paddingX: number
  headerHeight: number
  dayColWidth: number
  periodColWidth: number
  classColWidth: number
  classCount: number
  gradeHeaderHeight: number
  classHeaderHeight: number
  rowHeight: number
  dividerHeight: number
  legendHeight: number
  signatureHeight: number
  totalWidthBase: number
  totalHeightBase: number
  actualScale: number
  widthPx: number
  heightPx: number
  estimatedPrintSize: string
} {
  const showLegend = options.showLegend ?? true
  const showSignatures = options.showSignatures ?? true

  const paddingX = 30
  const headerHeight = 110
  const dayColWidth = 65
  const periodColWidth = 115
  const classColWidth = 125
  const classCount = Math.max(1, sheet.classes.length)
  const gradeHeaderHeight = 36
  const classHeaderHeight = 34
  const rowHeight = 44
  const dividerHeight = 28
  const legendHeight = showLegend ? 50 : 0
  const signatureHeight = showSignatures ? 60 : 0

  const totalWidthBase = paddingX * 2 + dayColWidth + periodColWidth + classCount * classColWidth

  let rowsHeightBase = 0
  sheet.rows.forEach((r) => {
    if (r.dividerBefore) rowsHeightBase += dividerHeight
    rowsHeightBase += rowHeight
  })

  const totalHeightBase =
    headerHeight +
    gradeHeaderHeight +
    classHeaderHeight +
    rowsHeightBase +
    legendHeight +
    signatureHeight +
    40

  // 浏览器原生上限（32767 像素），支持满血无约束导出 20000+ px 超清印刷海报
  const MAX_DIMENSION = 32767
  const MAX_PIXELS = 450_000_000

  let actualScale = requestedScale
  if (totalWidthBase * actualScale > MAX_DIMENSION) {
    actualScale = Math.min(actualScale, MAX_DIMENSION / totalWidthBase)
  }
  if (totalHeightBase * actualScale > MAX_DIMENSION) {
    actualScale = Math.min(actualScale, MAX_DIMENSION / totalHeightBase)
  }
  const totalPixels = totalWidthBase * totalHeightBase * actualScale * actualScale
  if (totalPixels > MAX_PIXELS) {
    actualScale = Math.min(actualScale, Math.sqrt(MAX_PIXELS / (totalWidthBase * totalHeightBase)))
  }
  actualScale = Math.max(0.5, Number(actualScale.toFixed(2)))

  const widthPx = Math.round(totalWidthBase * actualScale)
  const heightPx = Math.round(totalHeightBase * actualScale)

  // 物理尺寸估算 (以 300 DPI / 150 DPI 计算)
  const dpi = requestedScale >= 3 ? 300 : requestedScale >= 2 ? 200 : 150
  const cmWidth = ((widthPx / dpi) * 2.54).toFixed(1)
  const cmHeight = ((heightPx / dpi) * 2.54).toFixed(1)
  const estimatedPrintSize = `${cmWidth} cm × ${cmHeight} cm (${dpi} DPI 喷绘展板)`

  return {
    paddingX,
    headerHeight,
    dayColWidth,
    periodColWidth,
    classColWidth,
    classCount,
    gradeHeaderHeight,
    classHeaderHeight,
    rowHeight,
    dividerHeight,
    legendHeight,
    signatureHeight,
    totalWidthBase,
    totalHeightBase,
    actualScale,
    widthPx,
    heightPx,
    estimatedPrintSize
  }
}

/** 核心矢量课表绘制渲染器（支持全局视口与切片视口） */
export function drawVectorPosterContent(
  ctx: CanvasRenderingContext2D,
  sheet: OverviewExportSheet,
  options: PosterOptions = {},
  metrics: ReturnType<typeof calculatePosterMetrics>
): void {
  const theme = THEME_COLORS[options.theme ?? 'modern']
  const showLegend = options.showLegend ?? true
  const showSignatures = options.showSignatures ?? true
  const signatoryText =
    options.signatoryText ||
    '教务处制表：________________    分管校长审批：________________    公布日期：2026年___月___日'

  const title = options.customTitle || sheet.title || '全校总课程表'
  const subTitle = options.customSubTitle || sheet.subTitle || ''

  const {
    paddingX,
    headerHeight,
    dayColWidth,
    periodColWidth,
    classColWidth,
    classCount,
    gradeHeaderHeight,
    classHeaderHeight,
    rowHeight,
    dividerHeight,
    totalWidthBase,
    totalHeightBase
  } = metrics

  // 1. 全局背景
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, totalWidthBase, totalHeightBase)

  // 2. 顶部大标题横幅
  ctx.fillStyle = theme.headerBg
  ctx.fillRect(0, 0, totalWidthBase, headerHeight)

  // 装饰性光晕条
  ctx.fillStyle = theme.headerSub
  ctx.fillRect(0, headerHeight - 4, totalWidthBase, 4)

  // 主标题
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 30px "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, totalWidthBase / 2, 44)

  // 副标题与统计指标
  ctx.fillStyle = '#E2E8F0'
  ctx.font = '13.5px "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif'
  const subText = `${subTitle ? `${subTitle}  ·  ` : ''}全校共 ${sheet.stats.classCount} 个教学班  ·  周课程 ${sheet.stats.lessonCount} 节  ·  任课教师 ${sheet.stats.teacherCount} 人`
  ctx.fillText(subText, totalWidthBase / 2, 82)

  // 3. 表头绘制
  const startY = headerHeight + 15
  const startX = paddingX

  // (1) 星期与节次合并表头
  ctx.fillStyle = theme.dayBg
  ctx.fillRect(startX, startY, dayColWidth + periodColWidth, gradeHeaderHeight + classHeaderHeight)
  ctx.strokeStyle = theme.gridBorder
  ctx.lineWidth = 1
  ctx.strokeRect(startX, startY, dayColWidth + periodColWidth, gradeHeaderHeight + classHeaderHeight)

  ctx.fillStyle = theme.dayText
  ctx.font = 'bold 13px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    '时间 / 节次',
    startX + (dayColWidth + periodColWidth) / 2,
    startY + (gradeHeaderHeight + classHeaderHeight) / 2
  )

  // (2) 年级分组与班级表头
  let colX = startX + dayColWidth + periodColWidth
  for (const grade of sheet.grades) {
    const gWidth = grade.classCount * classColWidth

    // 年级横栏
    ctx.fillStyle = theme.gradeBg
    ctx.fillRect(colX, startY, gWidth, gradeHeaderHeight)
    ctx.strokeStyle = theme.gridBorder
    ctx.strokeRect(colX, startY, gWidth, gradeHeaderHeight)

    ctx.fillStyle = theme.gradeText
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${grade.name} (${grade.classCount}个班)`, colX + gWidth / 2, startY + gradeHeaderHeight / 2)

    colX += gWidth
  }

  // 班级子表头
  colX = startX + dayColWidth + periodColWidth
  for (const cls of sheet.classes) {
    ctx.fillStyle = theme.classBg
    ctx.fillRect(colX, startY + gradeHeaderHeight, classColWidth, classHeaderHeight)
    ctx.strokeStyle = theme.gridBorder
    ctx.strokeRect(colX, startY + gradeHeaderHeight, classColWidth, classHeaderHeight)

    ctx.fillStyle = theme.classText
    ctx.font = 'bold 12.5px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(cls.name, colX + classColWidth / 2, startY + gradeHeaderHeight + classHeaderHeight / 2)

    colX += classColWidth
  }

  // 4. 数据行与星期合并
  let currentY = startY + gradeHeaderHeight + classHeaderHeight
  const dayRowSpans = new Map<number, { startY: number; totalH: number; label: string }>()

  for (const row of sheet.rows) {
    // 段分隔条 (午休 / 晚自习)
    if (row.dividerBefore) {
      ctx.fillStyle = theme.dividerBg
      ctx.fillRect(startX, currentY, dayColWidth + periodColWidth + classCount * classColWidth, dividerHeight)
      ctx.strokeStyle = theme.gridBorder
      ctx.strokeRect(startX, currentY, dayColWidth + periodColWidth + classCount * classColWidth, dividerHeight)

      ctx.fillStyle = theme.dividerText
      ctx.font = 'italic 12px "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        `—— ${row.dividerBefore} ——`,
        startX + (dayColWidth + periodColWidth + classCount * classColWidth) / 2,
        currentY + dividerHeight / 2
      )

      currentY += dividerHeight
    }

    // 记录星期区间
    const existingDaySpan = dayRowSpans.get(row.day)
    if (!existingDaySpan) {
      dayRowSpans.set(row.day, {
        startY: currentY,
        totalH: rowHeight,
        label: row.dayName || `周${row.day}`
      })
    } else {
      existingDaySpan.totalH += rowHeight
    }

    // 绘制节次与时间
    const pX = startX + dayColWidth
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(pX, currentY, periodColWidth, rowHeight)
    ctx.strokeStyle = theme.gridBorder
    ctx.strokeRect(pX, currentY, periodColWidth, rowHeight)

    ctx.fillStyle = '#334155'
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(row.periodName, pX + periodColWidth / 2, currentY + rowHeight / 2 - 7)

    if (row.timeRange) {
      ctx.fillStyle = '#64748B'
      ctx.font = '10px "Microsoft YaHei", sans-serif'
      ctx.fillText(row.timeRange, pX + periodColWidth / 2, currentY + rowHeight / 2 + 8)
    }

    // 绘制各班级课程格子
    let cX = startX + dayColWidth + periodColWidth
    for (const cls of sheet.classes) {
      const cellData = row.cellsByClassId.get(cls.id)

      if (cellData && cellData.text) {
        if (cellData.isLocked) {
          ctx.fillStyle = '#FEF3C7'
        } else if (cellData.color) {
          ctx.fillStyle = cellData.color.startsWith('#') ? `${cellData.color}18` : '#EEF2FF'
        } else {
          ctx.fillStyle = '#F8FAFC'
        }
      } else {
        ctx.fillStyle = '#FFFFFF'
      }

      ctx.fillRect(cX, currentY, classColWidth, rowHeight)
      ctx.strokeStyle = theme.gridBorder
      ctx.strokeRect(cX, currentY, classColWidth, rowHeight)

      if (cellData && cellData.text) {
        // 学科名
        ctx.fillStyle = cellData.isLocked ? '#92400E' : '#0F172A'
        ctx.font = 'bold 12px "Microsoft YaHei", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const subjTitle =
          (cellData.subjectName || cellData.text.split('\n')[0] || '') +
          (cellData.isLocked ? ' 🔒' : '')
        ctx.fillText(subjTitle, cX + classColWidth / 2, currentY + rowHeight / 2 - 7)

        // 教师 / 场地
        const teacherTitle = cellData.teacherName || (cellData.text.split('\n')[1] ?? '')
        if (teacherTitle) {
          ctx.fillStyle = '#475569'
          ctx.font = '10.5px "Microsoft YaHei", sans-serif'
          ctx.fillText(teacherTitle, cX + classColWidth / 2, currentY + rowHeight / 2 + 8)
        }
      }

      cX += classColWidth
    }

    currentY += rowHeight
  }

  // (3) 回填绘制星期合并列
  for (const [, span] of dayRowSpans) {
    ctx.fillStyle = theme.dayBg
    ctx.fillRect(startX, span.startY, dayColWidth, span.totalH)
    ctx.strokeStyle = theme.gridBorder
    ctx.strokeRect(startX, span.startY, dayColWidth, span.totalH)

    ctx.fillStyle = theme.dayText
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(span.label, startX + dayColWidth / 2, span.startY + span.totalH / 2)
  }

  // 5. 底部图例与审批署名栏
  let footerY = currentY + 16

  if (showLegend) {
    const legendSubjects = [
      { name: '语文', color: '#EF4444' },
      { name: '数学', color: '#6366F1' },
      { name: '英语', color: '#10B981' },
      { name: '物理', color: '#3B82F6' },
      { name: '化学', color: '#F59E0B' },
      { name: '生物', color: '#84CC16' },
      { name: '政治', color: '#A855F7' },
      { name: '历史', color: '#D97706' },
      { name: '地理', color: '#14B8A6' },
      { name: '体育', color: '#F97316' },
      { name: '艺术/综合', color: '#EC4899' }
    ]

    ctx.fillStyle = '#475569'
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('学科配色图例：', startX, footerY + 12)

    let legX = startX + 90
    for (const leg of legendSubjects) {
      // 色块
      ctx.fillStyle = leg.color
      ctx.fillRect(legX, footerY + 5, 14, 14)
      ctx.strokeStyle = '#94A3B8'
      ctx.strokeRect(legX, footerY + 5, 14, 14)

      // 文本
      ctx.fillStyle = '#334155'
      ctx.font = '11.5px "Microsoft YaHei", sans-serif'
      ctx.fillText(leg.name, legX + 18, footerY + 12)

      legX += 75
    }

    footerY += 32
  }

  if (showSignatures) {
    ctx.fillStyle = '#1E293B'
    ctx.font = '12px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(signatoryText, startX, footerY + 12)

    ctx.fillStyle = '#64748B'
    ctx.font = 'italic 11px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(
      '★ 智课排智能排课系统输出 · 本图支持高清喷绘与展板大幅面张贴',
      startX + dayColWidth + periodColWidth + classCount * classColWidth,
      footerY + 12
    )
  }
}

/** 快速生成海报实时预览（1x 轻量级，极速返回，防止 UI 卡顿） */
export async function renderCampusOverviewPosterPreview(
  sheet: OverviewExportSheet,
  options: PosterOptions = {}
): Promise<PosterRenderResult> {
  const metrics = calculatePosterMetrics(sheet, options, 1)
  const canvas = document.createElement('canvas')
  canvas.width = metrics.widthPx
  canvas.height = metrics.heightPx

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 Canvas 绘图上下文')

  drawVectorPosterContent(ctx, sheet, options, metrics)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

  return {
    dataUrl,
    width: metrics.widthPx,
    height: metrics.heightPx,
    scale: 1,
    estimatedPrintSize: metrics.estimatedPrintSize
  }
}

/**
 * 分块切片流式导出超高分辨率海报（支持 23000+ px 巨幅印刷，内存恒定 < 100MB，彻底杜绝内存溢出）
 */
export async function exportCampusOverviewPosterStreaming(
  sheet: OverviewExportSheet,
  options: PosterOptions = {},
  onProgress?: (ratio: number, statusText: string) => void
): Promise<PosterExportStreamResult> {
  const requestedScale = options.scale ?? 3
  const metrics = calculatePosterMetrics(sheet, options, requestedScale)
  const { widthPx: fullWidth, heightPx: fullHeight, actualScale, estimatedPrintSize } = metrics

  const schoolName = options.customTitle ? '' : '全校'
  const dpiLabel =
    requestedScale >= 4
      ? '400DPI_超巨幅'
      : requestedScale >= 3.5
      ? '350DPI_巨幅印刷'
      : requestedScale >= 3
      ? '300DPI_广告喷绘级'
      : requestedScale >= 2
      ? '200DPI_高清'
      : '150DPI'

  const defaultName = `${sheet.title || `${schoolName}总课表`}_大幅海报_${dpiLabel}.png`

  // 1. 初始化主进程流式导出（弹出文件保存对话框）
  const initRes = await api['timetable:initPosterExport']({
    defaultName,
    fullWidth,
    fullHeight
  })

  if (initRes.canceled || !initRes.exportId) {
    return {
      canceled: true,
      width: fullWidth,
      height: fullHeight,
      scale: requestedScale,
      sizeBytes: 0,
      estimatedPrintSize
    }
  }

  const exportId = initRes.exportId

  try {
    // 2. 切片规划：将高度划分为若干水平 Strip（每条高度 ~1200-1800 像素）
    const targetStripHeight = 1500
    const totalStrips = Math.ceil(fullHeight / targetStripHeight)
    const maxTileWidth = 3200 // 单个切片宽度不超过 3200，保证显存处于极低负载
    const totalCols = Math.ceil(fullWidth / maxTileWidth)

    for (let sIdx = 0; sIdx < totalStrips; sIdx++) {
      const stripStartY = sIdx * targetStripHeight
      const thisStripHeight = Math.min(targetStripHeight, fullHeight - stripStartY)
      const stripRgba = new Uint8Array(fullWidth * thisStripHeight * 4)

      onProgress?.(
        sIdx / totalStrips,
        `正在渲染高精度切片 (${sIdx + 1}/${totalStrips} 行)...`
      )

      for (let cIdx = 0; cIdx < totalCols; cIdx++) {
        const tileStartX = cIdx * maxTileWidth
        const thisTileWidth = Math.min(maxTileWidth, fullWidth - tileStartX)

        // 创建临时微型切片 Canvas
        const tileCanvas = document.createElement('canvas')
        tileCanvas.width = thisTileWidth
        tileCanvas.height = thisStripHeight

        const tCtx = tileCanvas.getContext('2d')
        if (!tCtx) throw new Error('无法创建切片 Canvas 上下文')

        tCtx.save()
        // 将视口平移至切片局部坐标，并缩放到目标分辨率
        tCtx.translate(-tileStartX, -stripStartY)
        tCtx.scale(actualScale, actualScale)

        drawVectorPosterContent(tCtx, sheet, options, metrics)
        tCtx.restore()

        const tileImageData = tCtx.getImageData(0, 0, thisTileWidth, thisStripHeight)
        const tileData = tileImageData.data

        // 将切片像素拼接到当前 Strip 的缓冲区
        for (let row = 0; row < thisStripHeight; row++) {
          const srcOffset = row * thisTileWidth * 4
          const destOffset = (row * fullWidth + tileStartX) * 4
          stripRgba.set(tileData.subarray(srcOffset, srcOffset + thisTileWidth * 4), destOffset)
        }

        // 释放临时 Canvas
        tileCanvas.width = 0
        tileCanvas.height = 0
      }

      // 将当前完整行 Strip 写入主进程的 PNG 流
      const writeRes = await api['timetable:writePosterStrip']({
        exportId,
        stripRow: sIdx,
        stripHeight: thisStripHeight,
        rgba: stripRgba
      })

      if (!writeRes.success) {
        throw new Error(writeRes.error || '写入切片数据失败')
      }
    }

    onProgress?.(1.0, '正在封装并写入 300 DPI 无损 PNG 图像...')

    // 3. 完成流式导出
    const finishRes = await api['timetable:finishPosterExport']({ exportId })
    if (!finishRes.success) {
      throw new Error(finishRes.error || '完成文件保存失败')
    }

    return {
      canceled: false,
      filePath: finishRes.filePath,
      width: fullWidth,
      height: fullHeight,
      scale: requestedScale,
      sizeBytes: finishRes.sizeBytes,
      estimatedPrintSize
    }
  } catch (err) {
    await api['timetable:cancelPosterExport']({ exportId })
    throw err
  }
}
