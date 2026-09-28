import { createHashRouter } from 'react-router-dom'
import { AppLayout } from '@renderer/components/layout/AppLayout'
import { HomePage } from '@renderer/pages/Home/HomePage'
import { PlaceholderPage } from '@renderer/pages/PlaceholderPage'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'setup',
        element: <PlaceholderPage title="学校设置" milestone="M1 · 数据层与基础数据" />
      },
      {
        path: 'base-data',
        element: <PlaceholderPage title="基础数据" milestone="M1 · 数据层与基础数据" />
      },
      {
        path: 'teaching-matrix',
        element: <PlaceholderPage title="教学任务" milestone="M2 · 教学任务与规则" />
      },
      { path: 'rules', element: <PlaceholderPage title="排课规则" milestone="M2 · 教学任务与规则" /> },
      {
        path: 'scheduling',
        element: <PlaceholderPage title="开始排课" milestone="M3 · 排课引擎 v1" />
      },
      { path: 'timetable', element: <PlaceholderPage title="课表" milestone="M4 · 课表展示" /> },
      { path: 'report', element: <PlaceholderPage title="体检报告" milestone="M7 · 报告与导出" /> },
      { path: 'export', element: <PlaceholderPage title="导出中心" milestone="M7 · 报告与导出" /> },
      { path: 'versions', element: <PlaceholderPage title="版本历史" milestone="M9 · 扩展（选做）" /> }
    ]
  }
])
