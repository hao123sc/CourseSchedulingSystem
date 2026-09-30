import { cn } from '@renderer/lib/utils'
import { subjectVars, type GridLesson } from '@renderer/pages/Timetable/timetableModel'

/**
 * 课程块（docs/mockups/timetable.html · .lesson 定稿）：
 * 左侧 3px 学科色条、学科名（学科主色）、教师+教室次级灰、圆角 8px；
 * 连堂跨行（.tt-span，高度 56×N + 5×(N−1)）、右上角「连」标；
 * 预排锁定 🔒、单双周「单 / 双」角标；悬停 scale(1.025) + 阴影升级。
 *
 * 拖拽 / 落点着色 / 换课建议是 M6 交互调整的内容，这里只保留选中态。
 */
export function LessonCard({
  lesson,
  selected,
  waterfallIndex,
  onSelect
}: {
  lesson: GridLesson
  selected: boolean
  /** 瀑布式淡入的序号（-1 = 不播放动画，如切换班级时重挂载） */
  waterfallIndex: number
  onSelect?: (l: GridLesson) => void
}): React.JSX.Element {
  const span = lesson.blockSize > 1
  return (
    <div
      className={cn(
        'tt-lesson',
        span && 'tt-span',
        lesson.overlay && !lesson.color && 'tt-dim',
        selected && 'tt-sel',
        waterfallIndex >= 0 && 'tt-fall'
      )}
      style={{
        ...subjectVars(lesson.color),
        ...(span
          ? { height: `calc(56px * ${lesson.blockSize} + 5px * ${lesson.blockSize - 1})` }
          : {}),
        ...(waterfallIndex >= 0 ? { animationDelay: `${Math.min(waterfallIndex, 40) * 24}ms` } : {})
      }}
      title={lesson.title + (lesson.meta ? ` · ${lesson.meta}` : '')}
      onClick={() => onSelect?.(lesson)}
    >
      {span && lesson.blockIndex === 0 && <span className="tt-tag">连堂</span>}
      {lesson.weekMode === 'odd' && <span className="tt-tag">单</span>}
      {lesson.weekMode === 'even' && <span className="tt-tag">双</span>}
      {lesson.locked && !span && lesson.weekMode === 'all' && <span className="tt-lock">🔒</span>}
      {lesson.locked && (span || lesson.weekMode !== 'all') && (
        <span className="tt-lock" style={{ right: span ? '34px' : '22px' }}>
          🔒
        </span>
      )}
      <div className="tt-name">{lesson.subjectName}</div>
      {lesson.meta && <div className="tt-meta">{lesson.meta}</div>}
    </div>
  )
}
