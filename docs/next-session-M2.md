# 下阶段（M2）会话启动提示词

> 复制下面「提示词正文」整段，粘到**新会话**的第一条消息即可。
> 不要在提示词里写死分支名——Arena 每个新会话会自动分配一条新分支（是本会话分支的延续）。

---

## 提示词正文（复制这一整段）

```
这是一个跨会话的课表排课项目（智课排 / CourseSchedulingSystem）。请先按顺序做完准备工作，再动手写代码：

1. 读 PROGRESS.md —— 了解当前进度、已锁定决策 D1~D8、工作区纪律
2. 读 docs/08-会话交接指南.md
3. 读 docs/06-开发计划.md 中「M2 · 教学任务与规则」章节
4. 实现时按需查：docs/03-数据模型设计.md（数据结构/DDL）、docs/05-界面与交互设计.md（MatrixEditor / RuleGrid 交互规范）、docs/04-排课算法设计.md（规则原语 D4：FORBIDDEN/AVOID/NORMAL/PREFERRED）
5. git log --oneline -12 看最近提交

然后用不超过 10 行复述：这次要做什么、验收标准是什么、你的实现顺序、有哪些注意事项。等我确认后再开始写代码。

本次目标：执行 M2「教学任务与规则」。重点是 MatrixEditor 的 Excel 式键盘操作，和 RuleGrid 的拖刷交互——这两个决定录入效率，请优先打磨。M2 任务清单（照 docs/06）：
- MatrixEditor：Excel 式键盘操作、框选填充、Ctrl+D、行列合计
- 国家课程标准课时方案一键套用
- 教师指派器 + 工作量实时看板与超限预警
- RuleGrid 四层规则值调色网格（拖刷、作用域切换、分段分隔）
- 学科规则（每日上限、连堂、分布策略）
- 预排锁定（fixed_lesson）编辑
- 约束组（互斥/拼合）基础 CRUD
验收标准：为示范初中配齐全部教学任务与规则，数据可完整读出为 SolverInput（M3 引擎的输入）。

约束（务必遵守）：
- 只在本会话被分配到的那条 arena/*-courseschedulingsystem 分支上工作，不切换、不新建、不推到别的分支
- 不得推翻 PROGRESS.md 中已锁定的决策 D1~D8；如认为需要改动先问我
- 遵守工作区纪律：不产生零散临时文件，node_modules/构建产物绝不入库，每步后跑 git status + du -sh 确认无残留
- 需要引入文档未提及的新依赖（尤其原生模块/大体积库）必须先征得我同意
- 遇到设计文档没覆盖的空白或文档间矛盾，先问我，不要自己拍板
- 数据库如需变更一律新增 migration 文件（005_ 起），不改历史迁移文件
- src/solver/** 禁止 import Electron/Node 模块；冲突判定逻辑只放 src/shared/constraints 一份

环境注意（本 AI 沙箱的已知限制，别当成 bug）：
- 沙箱出网白名单不含 GitHub Release CDN / nodejs.org，无法编译 better-sqlite3 原生模块 → 涉及原生模块的单测会自动 skip、Electron 起窗口/打 exe 需我在真机验证；SQL/迁移逻辑可用 Python sqlite3 跑真实迁移来验证
- 若本会话分支缺上一步代码：先 git ls-remote --heads origin 找含最新代码的同级会话分支，用 git merge --ff-only 并入当前分支，不要切换分支

收尾时：逐条报告 M2 验收项达成情况，更新 PROGRESS.md（里程碑进度表 + 变更日志 + 新风险），提交推送，并给出下次（M3）会话的第一条指令。
```

---

## 给你（用户）的备忘

- **上个阶段状态**：M1 已完成并追加了收尾增强（测试数据种子脚本 `npm run seed:test`、班主任编辑 + 批量指定、固定教室保护修复）。分支 tip 见 PROGRESS.md。
- **换到新会话前**：本会话的所有改动已推到远端分支；新会话若拿到的是延续分支通常已含全部代码。若发现缺代码，让新助手用上面提示词里写的 `git merge --ff-only` 办法并入，别切分支。
- **M2 是重录入交互的里程碑**，工作量不算小。若单次会话做不完，可让助手先做前半段（MatrixEditor + 课时方案套用 + 教师指派器），RuleGrid 与约束组留到再下一次，并在 PROGRESS.md 标 🟡 进行中。
