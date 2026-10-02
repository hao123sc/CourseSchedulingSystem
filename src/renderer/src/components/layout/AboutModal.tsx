import { Modal } from '@renderer/components/ui/modal'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'

interface AboutModalProps {
  open: boolean
  onClose: () => void
}

export function AboutModal({ open, onClose }: AboutModalProps): React.JSX.Element {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="关于 智课排 (Zhikepai)"
      description="中小学全学段智能排课与课表管理系统"
      footer={
        <div className="flex w-full items-center justify-between text-xs text-[color:var(--text-secondary)]">
          <span>Copyright © 2026 四川省乐至中学信息中心 王建国. All Rights Reserved.</span>
          <Button variant="default" size="sm" onClick={onClose}>
            确定
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-xs leading-relaxed text-[color:var(--text-secondary)]">
        <div className="flex items-center gap-3 rounded-xl border border-[color:var(--border-subtle)] bg-brand-50/50 p-4 dark:bg-brand-950/20">
          <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white shadow">
            课
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-[color:var(--text-primary)]">智课排</span>
              <Badge tone="brand">v1.0.0 正式版</Badge>
            </div>
            <span className="text-[11px] text-[color:var(--text-secondary)]">
              中小学多学段智能排课引擎 · 四川省乐至中学信息中心 王建国 研发
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-[color:var(--border-subtle)] p-3">
          <span className="font-semibold text-[color:var(--text-primary)]">核心特性与优势：</span>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <b>多起点并行求解</b>：自研 DSATUR + min-conflicts + 软约束评分引擎，120
              班秒级排出零硬冲突课表；
            </li>
            <li>
              <b>国家课程标准内置</b>：预置 2022 义务教育与普通高中课标课时方案，支持一键套用；
            </li>
            <li>
              <b>四层时段规则与预排锁定</b>
              ：全校/年级/学科/教师四级精细控制，支持专用场地与多并发场地；
            </li>
            <li>
              <b>可视化交互换课与建议</b>：50 步撤销重做、落点冲突诊断与 Top 5 智能换课推荐；
            </li>
            <li>
              <b>多维度体检报告与打印导出</b>：六维度评分、热力图、柱状图、A4 自适应批量打印与导出。
            </li>
          </ul>
        </div>

        {/* 软件作者与知识产权声明 */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-[color:var(--border-subtle)] bg-slate-50/70 p-3 text-[11px] leading-relaxed dark:bg-slate-800/40">
          <div className="font-semibold text-[color:var(--text-primary)]">
            软件作者与版权声明 (Author & Copyright)：
          </div>
          <p>
            软件作者：<strong>四川省乐至中学信息中心 王建国</strong>
          </p>
          <p>
            本计算机软件著作权归 <strong>四川省乐至中学信息中心 王建国</strong> 所有。
          </p>
          <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
            © 2026 四川省乐至中学信息中心 王建国. 保留所有权利 (All Rights Reserved).
            本软件受中华人民共和国著作权法及国际版权公约保护。未经作者明确书面许可，任何单位或个人不得对本软件进行反编译、反汇编、商业分发或二次封装销售。
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between text-[11px] text-[color:var(--text-secondary)]">
          <span>技术栈：Electron + React + TypeScript + Tailwind + SQLite</span>
          <span>纯本地离线计算 · 100% 数据隐私安全</span>
        </div>
      </div>
    </Modal>
  )
}
