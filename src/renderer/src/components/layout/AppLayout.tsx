import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { Toaster } from '@renderer/components/ui/toaster'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { useUiStore } from '@renderer/stores/uiStore'

export function AppLayout(): React.JSX.Element {
  const load = useSchoolStore((s) => s.load)
  const zoomIn = useUiStore((s) => s.zoomIn)
  const zoomOut = useUiStore((s) => s.zoomOut)
  const resetZoom = useUiStore((s) => s.resetZoom)

  useEffect(() => {
    void load()
  }, [load])

  // Ctrl/Cmd + = / - / 0 缩放；Ctrl + 滚轮同理。放在捕获阶段，避免被表格/网格的按键处理吞掉
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        zoomIn()
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoomOut()
      } else if (e.key === '0') {
        e.preventDefault()
        resetZoom()
      }
    }
    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      if (e.deltaY < 0) zoomIn()
      else if (e.deltaY > 0) zoomOut()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('wheel', onWheel)
    }
  }, [zoomIn, zoomOut, resetZoom])

  return (
    // h-dvh 而非 h-screen：全屏/最大化切换时以「当前视口实际高度」为准，不会多出一截
    // w-full 而非 w-screen：w-screen = 100vw 含滚动条宽度，窄窗口下会横向溢出
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <Sidebar />
      {/* min-w-0：没有它时 flex 子项的最小宽度是内容宽度，宽表格会把整个外壳撑破 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto p-4 lg:p-5 xl:p-6">
          {/* 超宽屏下限制正文最大宽度，避免一行拉到 3000px 没法读；普通屏幕仍然铺满 */}
          <div className="mx-auto flex h-full w-full max-w-[1920px] flex-col">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  )
}
