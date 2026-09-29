import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { Toaster } from '@renderer/components/ui/toaster'
import { useSchoolStore } from '@renderer/stores/schoolStore'

export function AppLayout(): React.JSX.Element {
  const load = useSchoolStore((s) => s.load)
  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  )
}
