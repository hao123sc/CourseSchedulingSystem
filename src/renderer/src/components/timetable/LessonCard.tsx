import { cn } from '@renderer/lib/utils'
import { subjectVars, type GridLesson } from '@renderer/pages/Timetable/timetableModel'

/**
 * 课程块（docs/mockups/timetable.html · .lesson 定稿）：
 * 左侧 3px 学科色条、学科名（学科主色）、教师+教室次级灰、圆角 8px；
 * 连堂跨行（.tt-span，高度 56×N + 5×(N−1)）、右上角「连堂」标；
 * 预排锁定 🔒、单双周「单 / 双」角标；悬停 scale(1.025) + 阴影升级。
 *
 * 同格多课（多并发场地的教室视图，如田径场 4 班同时上体育）走紧凑堆叠：
 * 每张占格子高度的 1/N，只显示「学科 班级」单行。
 *
 * M6 同时支持拖拽与单击调课；卡片点击由页面决定是进入调课、取消，还是尝试
 * 落到当前课程所在格。这里阻止事件冒泡，避免卡片和格子各处理一次。
 */
export function LessonCard({
  lesson,
  selected,
  waterfallIndex,
  stack,
  onSelect,
  onDragStart,
  onDragEnd,
  onOpenRelated
}: {
  lesson: GridLesson
  selected: boolean
  /** 瀑布式淡入的序号（-1 = 不播放动画，如切换班级时重挂载） */
  waterfallIndex: number
  /** 同格多课时的堆叠位置；count=1 或缺省为整格单卡 */
  stack?: { index: number; count: number }
  onSelect?: (l: GridLesson) => void
  onDragStart?: (lesson: GridLesson, event: React.DragEvent<HTMLDivElement>) => void
  onDragEnd?: () => void
  onOpenRelated?: (lesson: GridLesson) => void
}): React.JSX.Element {
  const span = lesson.blockSize > 1 && stack == null
  const compact = stack != null && stack.count > 1
  // 紧凑行文案：教室视图 meta =「班级 · 教师」，取班级段
  const label = compact
    ? `${lesson.subjectName} ${lesson.meta.split(' · ')[0]}`
    : lesson.subjectName
  return (
    <div
      className={cn(
        'tt-lesson',
        span && 'tt-span',
        compact && 'tt-compact',
        lesson.overlay && !lesson.color && 'tt-dim',
        selected && 'tt-sel',
        waterfallIndex >= 0 && 'tt-fall',
        !lesson.locked && !lesson.overlay && onDragStart && 'cursor-grab active:cursor-grabbing'
      )}
      style={{
        ...subjectVars(lesson.color),
        ...(span
          ? { height: `calc(56px * ${lesson.blockSize} + 5px * ${lesson.blockSize - 1})` }
          : {}),
        ...(compact
          ? {
              top: `calc(${stack.index} * ((100% - ${(stack.count - 1) * 2}px) / ${stack.count}) + ${stack.index * 2}px)`,
              height: `calc((100% - ${(stack.count - 1) * 2}px) / ${stack.count})`
            }
          : {}),
        ...(waterfallIndex >= 0 ? { animationDelay: `${Math.min(waterfallIndex, 40) * 24}ms` } : {})
      }}
      title={
        lesson.title +
        (lesson.meta ? ` · ${lesson.meta}` : '') +
        (onOpenRelated && !lesson.overlay ? ' · 双击跳转关联课表' : '')
      }
      draggable={Boolean(onDragStart && !lesson.locked && !lesson.overlay)}
      onDragStart={(event) => onDragStart?.(lesson, event)}
      onDragEnd={onDragEnd}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onOpenRelated?.(lesson)
      }}
      onClick={(event) => {
        event.stopPropagation()
        onSelect?.(lesson)
      }}
    >
      {span && lesson.blockIndex === 0 && <span className="tt-tag">连堂</span>}
      {!compact && lesson.weekMode === 'odd' && <span className="tt-tag">单</span>}
      {!compact && lesson.weekMode === 'even' && <span className="tt-tag">双</span>}
      {!compact && lesson.locked && (
        <span
          className="tt-lock"
          style={{ right: span || lesson.weekMode !== 'all' ? '26px' : '5px' }}
        >
          🔒
        </span>
      )}
      <div className="tt-name">{label}</div>
      {!compact && lesson.meta && <div className="tt-meta">{lesson.meta}</div>}
    </div>
  )
}
