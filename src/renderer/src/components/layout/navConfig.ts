export interface NavItem {
  path: string
  label: string
  icon: string
  /** M0 阶段大部分页面仅有占位内容，用于导航项旁显示"未完成"提示 */
  implemented: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: '工作台', icon: '🏠', implemented: true },
  { path: '/setup', label: '学校设置', icon: '⚙️', implemented: true },
  { path: '/base-data', label: '基础数据', icon: '📚', implemented: true },
  { path: '/teaching-matrix', label: '教学任务', icon: '📋', implemented: true },
  { path: '/rules', label: '排课规则', icon: '🔧', implemented: true },
  { path: '/scheduling', label: '开始排课', icon: '▶️', implemented: true },
  { path: '/timetable', label: '课表', icon: '📅', implemented: true },
  { path: '/report', label: '体检报告', icon: '📊', implemented: true },
  { path: '/export', label: '导出中心', icon: '📤', implemented: true },
  { path: '/versions', label: '版本历史', icon: '🕐', implemented: false }
]
