import { useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import type { HealthCheckRow, SystemPingResult } from '@shared/types/ipc'

/**
 * M0 工作台：验证「渲染进程 → preload contextBridge → 主进程 IPC → better-sqlite3」
 * 全链路可用，是本里程碑最重要的可视化验收点。
 */
export function HomePage(): React.JSX.Element {
  const [ping, setPing] = useState<SystemPingResult | null>(null)
  const [rows, setRows] = useState<HealthCheckRow[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    try {
      const [p, list] = await Promise.all([
        window.zhikepai['system:ping'](),
        window.zhikepai['healthCheck:list']()
      ])
      setPing(p)
      setRows(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function handleInsert(): Promise<void> {
    setBusy(true)
    try {
      const text = message.trim() || `自检写入 @ ${new Date().toLocaleTimeString('zh-CN')}`
      await window.zhikepai['healthCheck:insert'](text)
      setMessage('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">工作台</h1>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          智课排 · 中小学全学段智能排课系统 —— M0 工程骨架
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>运行环境自检</CardTitle>
        </CardHeader>
        <CardContent>
          {ping ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <dt className="text-[color:var(--text-secondary)]">应用版本</dt>
              <dd>{ping.appVersion}</dd>
              <dt className="text-[color:var(--text-secondary)]">Electron</dt>
              <dd>{ping.electronVersion}</dd>
              <dt className="text-[color:var(--text-secondary)]">Chromium</dt>
              <dd>{ping.chromeVersion}</dd>
              <dt className="text-[color:var(--text-secondary)]">Node.js</dt>
              <dd>{ping.nodeVersion}</dd>
              <dt className="text-[color:var(--text-secondary)]">平台</dt>
              <dd>{ping.platform}</dd>
            </dl>
          ) : (
            <p className="text-sm text-[color:var(--text-secondary)]">加载中…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>数据库读写自检（better-sqlite3）</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <p className="rounded-btn bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-input border border-[color:var(--border-subtle)] bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-600"
              placeholder="输入一条测试消息，写入 health_check 表"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleInsert()
              }}
            />
            <Button onClick={() => void handleInsert()} disabled={busy}>
              写入测试行
            </Button>
          </div>

          <ul className="divide-y divide-[color:var(--border-subtle)] text-sm">
            {rows.length === 0 && (
              <li className="py-2 text-[color:var(--text-secondary)]">暂无记录</li>
            )}
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span>{r.message}</span>
                <span className="text-xs text-[color:var(--text-secondary)]">{r.createdAt}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
