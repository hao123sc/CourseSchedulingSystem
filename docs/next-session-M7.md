# 下一会话提示词：M7 报告与导出

你正在继续 `hao123sc/CourseSchedulingSystem`。只在当前分配的 `arena/*` 分支工作，不切换或新建分支；每个逻辑单元独立提交并推送。

## 开工前

1. 读取 `PROGRESS.md`、`docs/08-会话交接指南.md` 和 `docs/06-开发计划.md` 的 M7 章节。
2. 确认 M6 已完成：拖拽换课、冲突检测、锁定拦截、50 步撤销/重做、数据库事务持久化、`adjust_log`、007 migration、可用落点高亮、班级/教师双击跳转均已存在。
3. 运行 `git log --oneline -5`、`git status`；沙箱若没有依赖，执行 `npm install --ignore-scripts`。
4. 先理解当前课表页面的 `lesson + fixed_lesson` 合成逻辑，不要另造一套课表口径。

## M7 目标

实现课表右上角“导出”能力，至少包括：

- 当前班级课表导出；
- 当前教师课表导出；
- 当前教室课表导出；
- 当前版本 / 学段 / 目标实体筛选条件与页面一致；
- 优先实现 Excel，随后评估 PDF / 打印；
- 导出失败给出明确错误提示；
- 文件保存使用 Electron `dialog`，渲染端通过类型化 IPC 调用，不直接写绝对路径。

## 实现纪律

- 先写纯函数：把当前视图转换成导出行列，并覆盖普通课程、预排锁定课程、无学科 fixed_lesson、连堂、多并发场地。
- 再接主进程导出服务、IPC、preload 和 UI 菜单。
- 导出内容必须和页面显示的 `lesson + fixed_lesson` 合成结果一致。
- 不要继续调 M5 自动排课质量；允许自动排课“尽可能满意”，人工调整是正常闭环。
- `src/solver/**` 不得导入 Electron 或 Node 模块（worker 入口除外）。
- 数据库若有变更，新增 migration，不修改既有 migration。
- 验证至少执行：`npm run test:sqlite`、`npm run typecheck`、`npm run lint -- --no-fix`。

## M6 已知增强项（非 M7 阻塞）

- 连堂组整体移动语义；
- 页面重载后的调整历史恢复；
- 换课建议 Top5。
