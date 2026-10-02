import { createHashRouter } from 'react-router-dom'
import { AppLayout } from '@renderer/components/layout/AppLayout'
import { HomePage } from '@renderer/pages/Home/HomePage'
import { SchoolSetupPage } from '@renderer/pages/Setup/SchoolSetupPage'
import { BaseDataPage } from '@renderer/pages/BaseData/BaseDataPage'
import { TeachingMatrixPage } from '@renderer/pages/TeachingMatrix/TeachingMatrixPage'
import { RulesPage } from '@renderer/pages/Rules/RulesPage'
import { SchedulingPage } from '@renderer/pages/Scheduling/SchedulingPage'
import { TimetablePage } from '@renderer/pages/Timetable/TimetablePage'
import { ReportPage } from '@renderer/pages/Report/ReportPage'
import { ExportCenterPage } from '@renderer/pages/Export/ExportCenterPage'
import { VersionHistoryPage } from '@renderer/pages/Versions/VersionHistoryPage'

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
      { path: 'report', element: <ReportPage /> },
      { path: 'export', element: <ExportCenterPage /> },
      { path: 'versions', element: <VersionHistoryPage /> }
    ]
  }
])
