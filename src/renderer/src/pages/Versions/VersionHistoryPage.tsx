import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@renderer/lib/api'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { toast } from '@renderer/stores/toastStore'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Modal } from '@renderer/components/ui/modal'
import type { ScheduleVersion } from '@shared/types/entities'

export function VersionHistoryPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { currentSemester, loaded, load } = useSchoolStore()
  const semesterId = currentSemester?.id ?? null

  const [versions, setVersions] = useState<ScheduleVersion[]>([])
  const [loading, setLoading] = useState(false)

  // 对比状态
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [compareOpen, setCompareOpen] = useState(false)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const refreshVersions = (): void => {
    if (semesterId == null) return
    setLoading(true)
    api['schedule:listVersions'](semesterId)
      .then((rows) => setVersions([...rows].sort((a, b) => b.id - a.id)))
      .catch((e) => toast.error(`读取版本历史失败: ${String(e)}`))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refreshVersions()
  }, [semesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePublish = async (v: ScheduleVersion): Promise<void> => {
    try {
      await api['schedule:publishVersion'](v.id)
      toast.success(`已将「${v.name}」设为当前生效的正式课表！`)
      refreshVersions()
    } catch (err) {
      toast.error(`设置失败: ${String(err)}`)
    }
  }

  const handleDelete = async (v: ScheduleVersion): Promise<void> => {
    if (!confirm(`确定删除排课方案「${v.name}」？此操作不可恢复。`)) return
    try {
      await api['schedule:deleteVersion'](v.id)
      toast.success('已删除排课方案')
      setSelectedIds((prev) => prev.filter((id) => id !== v.id))
      refreshVersions()
    } catch (err) {
      toast.error(`删除失败: ${String(err)}`)
    }
  }

  const toggleSelect = (id: number): void => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id))
    } else {
      if (selectedIds.length >= 2) {
        setSelectedIds([selectedIds[1], id])
      } else {
        setSelectedIds([...selectedIds, id])
      }
    }
  }

  const compareV1 = versions.find((v) => v.id === selectedIds[0])
  const compareV2 = versions.find((v) => v.id === selectedIds[1])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 pb-16">
      {/* ── 顶部横幅 ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
            版本历史与方案管理
          </h1>
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
            查看历史排课方案、比对指标差异、管理正式生效课表
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.length === 2 && (
            <Button variant="default" size="sm" onClick={() => setCompareOpen(true)}>
              ⇄ 对比选中的 2 个版本
            </Button>
          )}
          <Button variant="default" size="sm" onClick={() => navigate('/scheduling')}>
            ▶ 开始新的排课
          </Button>
        </div>
      </div>

      {/* ── 版本列表卡片 ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-bold">
            本学期排课方案清单 ({versions.length})
          </CardTitle>
          <span className="text-xs text-[color:var(--text-secondary)]">
            提示：可勾选任意两个版本进行指标横向对比
          </span>
        </CardHeader>
        <CardContent>
          {versions.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 text-4xl">🕐</div>
              <h3 className="text-base font-semibold">暂无排课方案历史</h3>
              <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                完成排课求解后，每个生成的方案都会在此留存版本快照，支持随时回溯与导出
              </p>
              <Button className="mt-4" onClick={() => navigate('/scheduling')}>
                前往开始排课 →
              </Button>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[color:var(--border-subtle)]">
              {versions.map((v) => {
                const isSelected = selectedIds.includes(v.id)
                return (
                  <div
                    key={v.id}
                    className={`flex flex-wrap items-center justify-between gap-4 py-4 transition-all ${
                      isSelected ? 'bg-brand-50/30 px-3 rounded-lg dark:bg-brand-950/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(v.id)}
                        className="h-4 w-4 rounded accent-brand-600"
                        title="勾选以加入版本对比"
                      />
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[color:var(--text-primary)]">
                            {v.name}
                          </span>
                          {v.isPublished ? (
                            <Badge tone="green">● 正式生效</Badge>
                          ) : (
                            <Badge tone="slate">候选方案</Badge>
                          )}
                          {v.weightProfile && (
                            <Badge tone="brand">
                              {v.weightProfile === 'balanced'
                                ? '均衡风格'
                                : v.weightProfile === 'teacher_first'
                                  ? '教师优先'
                                  : '学生优先'}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-[color:var(--text-secondary)]">
                          <span>已排课程: <b className="text-[color:var(--text-primary)]">{v.lessonCount}</b> 节</span>
                          <span>硬冲突: <b className="text-emerald-600 dark:text-emerald-400">{v.hardViolations}</b></span>
                          {v.solveMs != null && <span>耗时: {(v.solveMs / 1000).toFixed(1)} 秒</span>}
                          <span>
                            生成时间: {v.createdAt ? new Date(v.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '近期'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!v.isPublished && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => handlePublish(v)}
                        >
                          设为正式课表
                        </Button>
                      )}
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => navigate(`/timetable?versionId=${v.id}`)}
                      >
                        📅 课表
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => navigate(`/report?versionId=${v.id}`)}
                      >
                        📊 体检报告
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => navigate(`/export?versionId=${v.id}`)}
                      >
                        📤 导出
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        onClick={() => handleDelete(v)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 版本比对弹窗 ── */}
      <Modal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title="方案横向比对"
        description="比对两个排课方案的核心指标与质量差异"
        footer={
          <Button variant="outline" onClick={() => setCompareOpen(false)}>
            关闭
          </Button>
        }
      >
        {compareV1 && compareV2 && (
          <div className="flex flex-col divide-y divide-[color:var(--border-subtle)] rounded-xl border border-[color:var(--border-subtle)] text-xs">
            <div className="grid grid-cols-3 bg-slate-50 p-3 font-bold dark:bg-slate-800">
              <span>比对维度</span>
              <span className="text-center font-bold text-brand-600">{compareV1.name}</span>
              <span className="text-center font-bold text-emerald-600">{compareV2.name}</span>
            </div>
            <div className="grid grid-cols-3 p-3">
              <span className="font-medium text-[color:var(--text-secondary)]">正式发布状态</span>
              <span className="text-center">{compareV1.isPublished ? '● 正式课表' : '候选方案'}</span>
              <span className="text-center">{compareV2.isPublished ? '● 正式课表' : '候选方案'}</span>
            </div>
            <div className="grid grid-cols-3 p-3">
              <span className="font-medium text-[color:var(--text-secondary)]">已排课节数</span>
              <span className="text-center font-bold">{compareV1.lessonCount} 节</span>
              <span className="text-center font-bold">{compareV2.lessonCount} 节</span>
            </div>
            <div className="grid grid-cols-3 p-3">
              <span className="font-medium text-[color:var(--text-secondary)]">硬约束违反数</span>
              <span className="text-center font-bold text-emerald-600">{compareV1.hardViolations} 处</span>
              <span className="text-center font-bold text-emerald-600">{compareV2.hardViolations} 处</span>
            </div>
            <div className="grid grid-cols-3 p-3">
              <span className="font-medium text-[color:var(--text-secondary)]">求解耗时</span>
              <span className="text-center">{compareV1.solveMs ? (compareV1.solveMs / 1000).toFixed(1) : '-'} 秒</span>
              <span className="text-center">{compareV2.solveMs ? (compareV2.solveMs / 1000).toFixed(1) : '-'} 秒</span>
            </div>
            <div className="grid grid-cols-3 p-3">
              <span className="font-medium text-[color:var(--text-secondary)]">创建时间</span>
              <span className="text-center">{compareV1.createdAt ? new Date(compareV1.createdAt).toLocaleDateString() : '-'}</span>
              <span className="text-center">{compareV2.createdAt ? new Date(compareV2.createdAt).toLocaleDateString() : '-'}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
