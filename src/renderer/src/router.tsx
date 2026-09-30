import { createHashRouter } from 'react-router-dom'
import { AppLayout } from '@renderer/components/layout/AppLayout'
import { HomePage } from '@renderer/pages/Home/HomePage'
import { PlaceholderPage } from '@renderer/pages/PlaceholderPage'
import { SchoolSetupPage } from '@renderer/pages/Setup/SchoolSetupPage'
import { BaseDataPage } from '@renderer/pages/BaseData/BaseDataPage'
import { TeachingMatrixPage } from '@renderer/pages/TeachingMatrix/TeachingMatrixPage'
import { RulesPage } from '@renderer/pages/Rules/RulesPage'
import { SchedulingPage } from '@renderer/pages/Scheduling/SchedulingPage'
import { TimetablePage } from '@renderer/pages/Timetable/TimetablePage'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'setup', element: <SchoolSetupPage /> },
      { path: 'base-data', element: <BaseDataPage /> },
      { path: 'teaching-matrix', element: <TeachingMatrixPage /> },
      { path: 'rules', element: <RulesPage /> },
      { path: 'scheduling', element: <SchedulingPage /> },
      { path: 'timetable', element: <TimetablePage /> },
      { path: 'report', element: <PlaceholderPage title="体检报告" milestone="M7 · 报告与导出" /> },
      { path: 'export', element: <PlaceholderPage title="导出中心" milestone="M7 · 报告与导出" /> },
      {
        path: 'versions',
        element: <PlaceholderPage title="版本历史" milestone="M9 · 扩展（选做）" />
      }
    ]
  }
])
