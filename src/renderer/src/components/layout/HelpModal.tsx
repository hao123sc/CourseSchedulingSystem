import { Modal } from '@renderer/components/ui/modal'
import { Button } from '@renderer/components/ui/button'

interface HelpModalProps {
  open: boolean
  onClose: () => void
}

export function HelpModal({ open, onClose }: HelpModalProps): React.JSX.Element {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="智课排 · 使用指南与快捷键"
      description="快速了解智能排课业务流程与高效键盘操作"
      footer={
        <Button variant="default" onClick={onClose}>
          我知道了
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-xs leading-relaxed text-[color:var(--text-secondary)]">
        {/* 排课六步法 */}
        <div className="flex flex-col gap-2 rounded-lg border border-[color:var(--border-subtle)] p-3">
          <span className="font-semibold text-[color:var(--text-primary)]">推荐排课流程：</span>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              <b>学校设置</b>：确认启用学段（小学/初中/高中）及每日作息时段模板；
            </li>
            <li>
              <b>基础数据</b>：建立年级班级、导入/录入任课教师及普通/专用教室场地；
            </li>
            <li>
              <b>教学任务</b>：套用国家课程方案或手工填写各班周课时，指派任课教师；
            </li>
            <li>
              <b>排课规则</b>：刷选教师/学科/年级禁排与优选时段，录入升旗、早读、晚自习等预排；
            </li>
            <li>
              <b>开始排课</b>：选择权重优化风格（均衡/教师优先/学生优先），启动并行排课求解；
            </li>
            <li>
              <b>课表与体检</b>：查看班级/教师/教室课表，结合体检报告微调，导出全套 Excel。
            </li>
          </ol>
        </div>

        {/* 快捷键说明 */}
        <div className="flex flex-col gap-2 rounded-lg border border-[color:var(--border-subtle)] p-3">
          <span className="font-semibold text-[color:var(--text-primary)]">常用快捷键：</span>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <kbd className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">Ctrl + Z</kbd>{' '}
              撤销上一步换课
            </div>
            <div>
              <kbd className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">Ctrl + Y</kbd>{' '}
              重做换课操作
            </div>
            <div>
              <kbd className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">Ctrl + =</kbd>{' '}
              放大界面比例
            </div>
            <div>
              <kbd className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">Ctrl + -</kbd>{' '}
              缩小界面比例
            </div>
            <div>
              <kbd className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">Ctrl + 0</kbd>{' '}
              重置为 100% 比例
            </div>
            <div>
              <kbd className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">Esc</kbd>{' '}
              关闭当前弹窗/退出选择
            </div>
          </div>
        </div>

        {/* 底部版权说明 */}
        <div className="flex items-center justify-between border-t border-[color:var(--border-subtle)] pt-2 text-[10.5px] text-slate-400">
          <span>软件作者：四川省乐至中学信息中心 王建国</span>
          <span>Copyright © 2026 All Rights Reserved</span>
        </div>
      </div>
    </Modal>
  )
}
