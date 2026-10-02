import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@renderer/lib/api'
import { useSchoolStore } from '@renderer/stores/schoolStore'
import { useMetaStore } from '@renderer/stores/metaStore'
import { toast } from '@renderer/stores/toastStore'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import type { ScheduleVersion, TeachingTask } from '@shared/types/entities'
import type { PresetCode } from '@shared/types/ipc'

interface WorkflowStep {
  step: number
  title: string
  desc: string
  path: string
  icon: string
  ready: boolean
  statusText: string
}

export function HomePage(): React.JSX.Element {
  const navigate = useNavigate()
  const { school, currentSemester, loaded, load } = useSchoolStore()
  const meta = useMetaStore()
  const semesterId = currentSemester?.id ?? null

  const [versions, setVersions] = useState<ScheduleVersion[]>([])
  const [tasks, setTasks] = useState<TeachingTask[]>([])
  const [loadingPreset, setLoadingPreset] = useState<PresetCode | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    if (semesterId != null) {
      void meta.load(semesterId)
      api['schedule:listVersions'](semesterId)
        .then((rows) => setVersions([...rows].sort((a, b) => b.id - a.id)))
        .catch(() => setVersions([]))
      api['task:list'](semesterId)
        .then((rows) => setTasks(rows))
        .catch(() => setTasks([]))
    }
  }, [semesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  const latestVersion = useMemo(() => {
    return versions.find((v) => v.isPublished) ?? versions[0] ?? null
  }, [versions])

  const totalWeeklyPeriods = useMemo(() => {
    return tasks.reduce((sum, t) => sum + t.weeklyPeriods, 0)
  }, [tasks])

  // 六步工作流完成状态
  const workflowSteps: WorkflowStep[] = [
    {
      step: 1,
      title: '学校设置',
      desc: '学段作息与日节次定义',
      path: '/setup',
      icon: '⚙️',
      ready: meta.stages.some((s) => s.enabled),
      statusText:
        meta.stages
          .filter((s) => s.enabled)
          .map((s) => s.name)
          .join('、') || '未启用学段'
    },
    {
      step: 2,
      title: '基础数据',
      desc: '年级、班级、教师与专用教室',
      path: '/base-data',
      icon: '📚',
      ready: meta.classes.length > 0 && meta.teachers.length > 0,
      statusText: `${meta.classes.length} 班 · ${meta.teachers.filter((t) => t.enabled).length} 师 · ${meta.classrooms.filter((r) => r.enabled).length} 室`
    },
    {
      step: 3,
      title: '教学任务',
      desc: '课程标准与任课教师指派矩阵',
      path: '/teaching-matrix',
      icon: '📋',
      ready: tasks.length > 0,
      statusText:
        tasks.length > 0 ? `${tasks.length} 门次 · 周 ${totalWeeklyPeriods} 节` : '待配置课程任务'
    },
    {
      step: 4,
      title: '排课规则',
      desc: '四层时段规则、预排锁定与约束组',
      path: '/rules',
      icon: '🔧',
      ready: true,
      statusText: '已配置时段与预排约束'
    },
    {
      step: 5,
      title: '开始排课',
      desc: '多起点并行引擎自动求解',
      path: '/scheduling',
      icon: '▶️',
      ready: versions.length > 0,
      statusText: versions.length > 0 ? `已生成 ${versions.length} 个版本` : '等待首次排课'
    },
    {
      step: 6,
      title: '课表与输出',
      desc: '多视角课表、体检报告与 Excel 导出',
      path: '/timetable',
      icon: '📊',
      ready: latestVersion != null,
      statusText: latestVersion ? `${latestVersion.name}` : '未生成课表'
    }
  ]

  const handleLoadPreset = async (preset: PresetCode): Promise<void> => {
    setLoadingPreset(preset)
    try {
      const res = await api['seed:loadPreset'](preset)
      if (res.success) {
        toast.success(res.message)
        await load()
        if (res.semesterId) {
          await meta.load(res.semesterId)
          const newVersions = await api['schedule:listVersions'](res.semesterId)
          setVersions(newVersions)
          const newTasks = await api['task:list'](res.semesterId)
          setTasks(newTasks)
        }
      }
    } catch (err) {
      toast.error(`载入预设失败: ${String(err)}`)
    } finally {
      setLoadingPreset(null)
    }
  }

  const handleBackup = async (): Promise<void> => {
    setBackingUp(true)
    try {
      const res = await api['system:backup']()
      if (!res.canceled && res.filePath) {
        toast.success(`数据库已备份至 ${res.filePath}`)
      }
    } catch (err) {
      toast.error(`备份失败: ${String(err)}`)
    } finally {
      setBackingUp(false)
    }
  }

  const handleRestore = async (): Promise<void> => {
    if (!confirm('恢复备份将覆盖当前所有数据，是否继续？')) return
    try {
      const res = await api['system:restore']()
      if (!res.canceled && res.success) {
        toast.success('数据库已成功恢复！')
        await load()
        if (semesterId != null) {
          await meta.load(semesterId)
        }
      }
    } catch (err) {
      toast.error(`恢复失败: ${String(err)}`)
    }
  }

  const handleResetData = async (): Promise<void> => {
    if (
      !confirm(
        '⚠️ 警告：确定要清空全部业务数据并恢复初始状态吗？\n\n' +
          '• 将清除所有学校、学期、年级、班级、教师、场地、教学任务、排课规则与课表结果；\n' +
          '• 学段作息、19个内置学科与3档权重档位将恢复为出厂默认设置；\n' +
          '• 建议在清空前先点击「💾 备份数据」。\n\n' +
          '是否确定继续清空？'
      )
    ) {
      return
    }

    setResetting(true)
    try {
      const res = await api['system:resetData']()
      if (res.success) {
        toast.success(res.message)
        await load()
        meta.reset()
        setVersions([])
        setTasks([])
      }
    } catch (err) {
      toast.error(`清空数据失败: ${String(err)}`)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 pb-16">
      {/* ===== 顶部横幅 ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-[color:var(--border-subtle)] bg-gradient-to-r from-brand-50/70 via-[color:var(--bg-card)] to-indigo-50/50 p-6 shadow-sm dark:from-brand-950/20 dark:via-[color:var(--bg-card)] dark:to-indigo-950/20 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-base font-bold text-white shadow-sm">
                课
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
                智课排 · 工作台
              </h1>
              <Badge tone="brand">中小学智能排课系统</Badge>
            </div>
            <p className="text-xs leading-relaxed text-[color:var(--text-secondary)]">
              {school?.name || '阳光实验完全中学'} ·{' '}
              {currentSemester?.name || '2026-2027学年第一学期'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleBackup} disabled={backingUp}>
              💾 备份数据
            </Button>
            <Button variant="outline" size="sm" onClick={handleRestore}>
              📂 恢复备份
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              onClick={handleResetData}
              disabled={resetting || loadingPreset !== null}
            >
              {resetting ? '正在清空...' : '🗑️ 清空数据'}
            </Button>
            <Button variant="default" size="sm" onClick={() => navigate('/scheduling')}>
              ▶ 开始排课
            </Button>
          </div>
        </div>

        {/* 关键统计指标条 */}
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-[color:var(--border-subtle)] pt-5 sm:grid-cols-5">
          <div className="flex flex-col">
            <span className="text-xs text-[color:var(--text-secondary)]">教学班级</span>
            <div className="mt-1 text-xl font-extrabold text-[color:var(--text-primary)]">
              {meta.classes.length}{' '}
              <small className="text-xs font-normal text-[color:var(--text-secondary)]">班</small>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-[color:var(--text-secondary)]">在职教师</span>
            <div className="mt-1 text-xl font-extrabold text-[color:var(--text-primary)]">
              {meta.teachers.filter((t) => t.enabled).length}{' '}
              <small className="text-xs font-normal text-[color:var(--text-secondary)]">人</small>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-[color:var(--text-secondary)]">教室场地</span>
            <div className="mt-1 text-xl font-extrabold text-[color:var(--text-primary)]">
              {meta.classrooms.filter((r) => r.enabled).length}{' '}
              <small className="text-xs font-normal text-[color:var(--text-secondary)]">间</small>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-[color:var(--text-secondary)]">周课时量</span>
            <div className="mt-1 text-xl font-extrabold text-[color:var(--text-primary)]">
              {totalWeeklyPeriods}{' '}
              <small className="text-xs font-normal text-[color:var(--text-secondary)]">
                节/周
              </small>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-[color:var(--text-secondary)]">排课版本</span>
            <div className="mt-1 text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {versions.length}{' '}
              <small className="text-xs font-normal text-[color:var(--text-secondary)]">版</small>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 六步排课业务导航 ===== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <span>🚀</span> 排课业务全流程引导
            </CardTitle>
            <span className="text-xs text-[color:var(--text-secondary)]">
              从基础配置到成果输出的标准流程
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workflowSteps.map((step) => (
              <div
                key={step.step}
                className="group flex flex-col justify-between rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-4 transition-all hover:border-brand-500 hover:shadow-sm"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-bold text-[color:var(--text-primary)]">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs dark:bg-slate-800">
                        {step.step}
                      </span>
                      {step.title}
                    </span>
                    <Badge tone={step.ready ? 'green' : 'slate'}>
                      {step.ready ? '✓ 已就绪' : '待配置'}
                    </Badge>
                  </div>
                  <p className="text-xs text-[color:var(--text-secondary)]">{step.desc}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[color:var(--border-subtle)] pt-3">
                  <span className="truncate text-[11px] text-[color:var(--text-secondary)]">
                    {step.statusText}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-brand-600 group-hover:bg-brand-50 dark:group-hover:bg-brand-950/40"
                    onClick={() => navigate(step.path)}
                  >
                    进入 →
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ===== 快速体验预设数据中心 ===== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <span>⚡</span> 预设示范数据一键载入
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge tone="amber">演示与测评专用</Badge>
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                onClick={handleResetData}
                disabled={resetting || loadingPreset !== null}
              >
                {resetting ? '正在清空...' : '🗑️ 清空全部数据（恢复初始）'}
              </Button>
            </div>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)]">
            一键载入不同类型学校的全套基础数据、国家课标任务与时段规则，并自动完成排课求解；或一键清空全部数据恢复出厂初始状态
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* 1. 示范高完中 */}
            <div className="flex flex-col justify-between rounded-xl border border-brand-200 bg-brand-50/40 p-4 dark:border-brand-900/50 dark:bg-brand-950/20">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-brand-900 dark:text-brand-100">
                    示范高完中（120班）
                  </span>
                  <Badge tone="brand">主演示</Badge>
                </div>
                <p className="text-xs leading-relaxed text-[color:var(--text-secondary)]">
                  初中 8 节/天 + 高中 13 节/天（早读+晚自习）；256 位教师、141
                  间教室；初高中双学段全量排课。
                </p>
              </div>
              <Button
                variant="default"
                size="sm"
                className="mt-4 w-full"
                disabled={loadingPreset !== null}
                onClick={() => handleLoadPreset('complete')}
              >
                {loadingPreset === 'complete' ? '正在载入与求解...' : '载入高完中 120 班数据'}
              </Button>
            </div>

            {/* 2. 示范初中 */}
            <div className="flex flex-col justify-between rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">示范初级中学（60班）</span>
                  <Badge tone="slate">初中</Badge>
                </div>
                <p className="text-xs leading-relaxed text-[color:var(--text-secondary)]">
                  初一至初三各 20 班；8 节/天作息；128 位教师、72 间教室；义教课标 31 节/周。
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                disabled={loadingPreset !== null}
                onClick={() => handleLoadPreset('junior')}
              >
                {loadingPreset === 'junior' ? '正在载入与求解...' : '载入初中 60 班数据'}
              </Button>
            </div>

            {/* 3. 示范高中 */}
            <div className="flex flex-col justify-between rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">示范高级中学（60班）</span>
                  <Badge tone="slate">高中</Badge>
                </div>
                <p className="text-xs leading-relaxed text-[color:var(--text-secondary)]">
                  高一至高三各 20 班；13 节/天（早读+晚自习）；128 位教师、72 间教室；高中学分课时。
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                disabled={loadingPreset !== null}
                onClick={() => handleLoadPreset('senior')}
              >
                {loadingPreset === 'senior' ? '正在载入与求解...' : '载入高中 60 班数据'}
              </Button>
            </div>

            {/* 4. 示范小学 */}
            <div className="flex flex-col justify-between rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">示范小学（120班）</span>
                  <Badge tone="slate">小学</Badge>
                </div>
                <p className="text-xs leading-relaxed text-[color:var(--text-secondary)]">
                  一至六年级各 20 班；7 节/天作息；180 位教师、130 间教室；低段 26 节、中高段 30
                  节。
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                disabled={loadingPreset !== null}
                onClick={() => handleLoadPreset('primary')}
              >
                {loadingPreset === 'primary' ? '正在载入与求解...' : '载入小学 120 班数据'}
              </Button>
            </div>

            {/* 5. 十二年一贯制全功能黄金数据 */}
            <div className="flex flex-col justify-between rounded-xl border border-amber-300 bg-amber-50/40 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">十二年一贯制全功能测试校（240班）</span>
                  <Badge tone="amber">容量上限</Badge>
                </div>
                <p className="text-xs leading-relaxed text-[color:var(--text-secondary)]">
                  小一至高三各 20 班、每班 54 人；547 位教师、347 间场地、约 7220
                  节正课，覆盖单双周、连堂、实验室、预排与全部约束类型。
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                disabled={loadingPreset !== null}
                onClick={() => handleLoadPreset('stress')}
              >
                {loadingPreset === 'stress'
                  ? '正在生成 240 班黄金课表...'
                  : '载入十二年一贯制全功能数据'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== 当前排课方案与输出卡片 ===== */}
      {latestVersion && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <span>📅</span> 最新排课方案 · {latestVersion.name}
              </CardTitle>
              {latestVersion.isPublished && <Badge tone="green">正式课表</Badge>}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[color:var(--border-subtle)] bg-slate-50/60 p-4 text-xs dark:bg-slate-800/40">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <span className="text-[color:var(--text-secondary)]">已排课时</span>
                  <div className="mt-0.5 text-base font-bold text-[color:var(--text-primary)]">
                    {latestVersion.lessonCount} 节
                  </div>
                </div>
                <div>
                  <span className="text-[color:var(--text-secondary)]">硬约束冲突</span>
                  <div className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {latestVersion.hardViolations} 处 (完美)
                  </div>
                </div>
                <div>
                  <span className="text-[color:var(--text-secondary)]">生成时间</span>
                  <div className="mt-0.5 text-sm font-semibold text-[color:var(--text-primary)]">
                    {latestVersion.createdAt
                      ? new Date(latestVersion.createdAt).toLocaleString('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '刚刚'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate(`/timetable?versionId=${latestVersion.id}`)}
                >
                  📅 查看课表
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/report?versionId=${latestVersion.id}`)}
                >
                  📊 体检报告
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/export?versionId=${latestVersion.id}`)}
                >
                  📤 导出 Excel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 底部版权信息 */}
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border-subtle)] pt-4 text-xs text-[color:var(--text-secondary)]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[color:var(--text-primary)]">智课排 (Zhikepai)</span>
          <span>· 中小学多学段智能排课与课表管理系统</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span>本地离线引擎就绪</span>
          <span>·</span>
          <span>SQLite 纯本地数据库</span>
          <span>·</span>
          <span>Copyright © 2026 智课排研发团队. All Rights Reserved.</span>
        </div>
      </footer>
    </div>
  )
}
