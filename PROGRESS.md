# 项目进度台账

> **本文件是项目状态的唯一事实来源（Single Source of Truth）。**
> 每个会话开始时必须先读本文件；每个会话结束前必须更新本文件并提交。
> 最后更新：2026-09-28 · **M0 已完成**（用户 Win11 真机验证通过：exe 打包成功、npm run dev 弹窗正常、DB 读写正常）

---

## 一、当前状态

| 项 | 值 |
|---|---|
| **当前阶段** | **M0 工程骨架已完成并通过真机验收** |
| **下一个里程碑** | **M1 · 数据层与基础数据** |
| **工作分支** | 由 Arena 按会话自动分配（形如 `arena/xxxxxxxx-courseschedulingsystem`），每个新会话会在上一个会话分支的最新提交上派生出新分支 —— **不要在提示词里写死具体分支名，也不要要求切换/合并到其他分支**，跟着当前会话拿到的分支走即可，Arena 保证是上一次工作的延续 |
| **PR** | https://github.com/hao123sc/CourseSchedulingSystem/pull/1 |
| **代码行数** | ~770 行（`src/**/*.ts(x)`，不含 node_modules） |
| **仓库体积** | ~2.0MB（不含 node_modules/.git） |

---

## 二、里程碑进度

| 里程碑 | 状态 | 完成日期 | 备注 |
|---|---|---|---|
| 设计阶段 | ✅ 完成 | 2026-09-28 | 8 份文档 + 3 份视觉稿 |
| **M0 · 工程骨架** | ✅ 完成 | 2026-09-28 | 用户在 Win11 真机验证：`npm run dev` 弹窗正常、工作台读写测试行正常、`npm run build:win` 成功出 exe。沙箱侧验证记录见六、变更日志 #2/#3 |
| M1 · 数据层与基础数据 | ⬜ 未开始 | | |

| M2 · 教学任务与规则 | ⬜ 未开始 | | |
| M3 · 排课引擎 v1（无冲突） | ⬜ 未开始 | | |
| M4 · 课表展示 | ⬜ 未开始 | | 视觉稿已定稿，照 `docs/mockups/` 实现 |
| M5 · 引擎 v2（质量优化） | ⬜ 未开始 | | |
| M6 · 交互调整 | ⬜ 未开始 | | |
| M7 · 报告与导出 | ⬜ 未开始 | | 视觉稿已定稿 |
| M8 · 示例数据与打磨 | ⬜ 未开始 | | 交付态 |
| M9 · 扩展（选做） | ⬜ 未开始 | | 走班/单双周/版本回滚 |

状态图例：⬜未开始　🟡进行中　✅完成　⚠️有阻塞

---

## 三、已锁定的决策（**不得推翻，如需变更须显式告知**）

| 编号 | 决策 | 定稿日期 |
|---|---|---|
| D1 | 技术栈：**Electron + React + TypeScript + SQLite(better-sqlite3) + Tailwind + shadcn/ui** | 2026-09-28 |
| D2 | 三学段（小学/初中/高中）全覆盖；年级班级**全动态**不硬编码；每年级 ≥20 班；设计容量 240 教学班 | 2026-09-28 |
| D3 | 引擎：AC-3 预处理 → DSATUR 构造 → ALNS 主优化 → LAHC 精修 → **Polish 抛光** | 2026-09-28 |
| D4 | 规则原语：四层时段规则值 `FORBIDDEN / AVOID / NORMAL / PREFERRED` | 2026-09-28 |
| D5 | **无登录、无角色、无权限**（单机单用户） | 2026-09-28 |
| D6 | **不做现场答辩，评委直接使用软件** → 算法做强但不在 UI 表演；优先级为「课表质量 > 界面美观 > 零门槛上手」 | 2026-09-28 |
| D7 | 场地区分 `capacity`（座位数）与 `concurrent_capacity`（同时可上班数）；新增人数容量硬约束 | 2026-09-28 |
| D8 | 视觉方向按 `docs/mockups/` 三份视觉稿定稿：Slate 冷灰 + Indigo 主色 | 2026-09-28 |

---

## 四、工作区纪律（**每个会话必须遵守**）

1. **空间**：仓库总量 < 50MB；`node_modules`/构建产物一律 gitignore，绝不入库
2. **文件**：不产生零散临时文件；中间产物用完即删（`/tmp` 下的脚本、下载缓存等）
3. **验证**：每步操作后跑 `git status` + `du -sh`，确认无残留、无膨胀
4. **分支**：只在当前会话被分配到的那条 `arena/*-courseschedulingsystem` 分支上工作，不切换、不新建、不合并到其他分支——**提示词模板里不要写死具体分支名**，每个新会话的分支名都不一样（是上一个会话分支的延续），写死了反而会导致新会话卡住无法切换（历史教训见六、变更日志）
5. **提交**：每个里程碑内的逻辑单元独立提交，信息用 `feat(模块): 说明` 格式
6. **收尾**：会话结束前更新本文件的「当前状态」「里程碑进度」「变更日志」并提交推送

---

## 五、已知风险与注意事项

| 级别 | 事项 | 应对 |
|---|---|---|
| 🟢 已解决（2026-09-28） | `better-sqlite3` 是原生模块，Electron 打包易失败 | `asarUnpack` 配置 + 用户在 Win11 真机跑通 `npm run build:win` 成功出 exe，`npm run dev` 弹窗后 DB 读写正常，**M0 头号风险已闭环** |
| 🔴 致命 | **本 AI 沙箱出网白名单不含 GitHub Release CDN**（`release-assets.githubusercontent.com`/`objects.githubusercontent.com`/`artifacts.electronjs.org`/`nodejs.org`/npmmirror 等均连接失败，仅 `registry.npmjs.org`、`github.com`/`api.github.com`/`codeload.github.com`、pypi 等少数域名可用） | 凡涉及下载 Electron 运行时二进制、Electron headers（`electron-rebuild` 用）、electron-builder 打包工具（nsis/7za/winCodeSign）的步骤，**必须由用户在有完整外网的机器（或 CI）上跑**，不能在本沙箱内完成。已把可复现的替代验证方式写进 `README.md`「本地开发/打包」一节（用本机 Node headers 编译 better-sqlite3 并跑通生产代码路径的读写测试）。**每个新会话遇到需要真机验证的步骤，先如实告知这一限制，不要假装验证通过。** |
| 🟢 已解决（2026-09-28） | Windows 上 `npm run build:win` 首次曾卡在 `winCodeSign-2.6.0.7z` 解压：`Cannot create symbolic link`（压缩包内含 macOS dylib 符号链接，普通 Windows 用户默认无创建符号链接权限） | electron-builder 在 Windows 上的已知通病，与本项目代码无关。修复：① 开启 Win11「开发者模式」（设置→隐私和安全性→开发者选项）后清空 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` 重试；② 或以管理员身份运行终端。用户已用方法①复测通过，exe 打包成功——**遇到同样报错可直接套用这个修复，不必重新排查** |
| 🟢 已修复 | `postinstall` 原用 `electron-rebuild -f -w better-sqlite3`，与 electron-builder 自带的原生依赖重建机制重复（electron-builder 日志已提示） | 已改为官方推荐的 `electron-builder install-app-deps`，移除 `@electron/rebuild` devDependency |
| 🟠 高 | 课表质量不达标会被评委随手抽查发现 | M5 建立回归指标断言，每次算法改动必跑 `npm run bench` |
| 🟠 高 | UI 精致度不足 | M4 单独成里程碑，不与功能混做；严格照视觉稿与设计 token |
| 🟡 中 | 240 班性能 | 分治 + 多起点并行 + 位图/计数器 + 增量评分 |
| 🟡 中 | 范围蔓延 | M9 全部选做；M1~M8 完成即可交付 |

**易错点**：
- 教师/班级占用用**位图**，场地占用必须用**计数器**（并发容量 >1），三者结构不同，勿混用
- 冲突判定逻辑只有一份，位于 `src/shared/constraints`，引擎与渲染端共用
- `src/solver/**` 禁止 import Electron/Node 模块（worker 入口除外）

---

## 六、变更日志

| 日期 | 会话 | 内容 |
|---|---|---|
| 2026-09-28 | #1 | 需求调研、案例对标、8 份设计文档、3 份视觉稿、PR #1 |
| 2026-09-28 | #2 | M0 工程骨架：electron-vite + React + TS + Tailwind 骨架、左侧导航/主题切换、类型化 IPC（`shared/types/ipc.ts` + preload contextBridge）、`better-sqlite3` 接入（`src/main/db/connection.ts` + health_check 自检表 + IPC）、ESLint/Prettier/Vitest 配置、electron-builder 打包配置与图标。**发现沙箱出网白名单不含 GitHub Release CDN，无法在沙箱内下载 Electron 运行时/headers/打包工具**；已用本机 Node headers 编译 better-sqlite3 并跑通与生产代码一致的读写路径（`connection.test.ts`），`electron-vite build` 产物验证通过，`npm run typecheck/lint/test` 全绿；exe 实打包与 `npm run dev` 起窗口留给用户在本地/CI 反馈 |
| 2026-09-28 | #3 | 用户在真实 Win11 机器上首次执行 `npm run build:win`：`electron-vite build` 产物正常、`better-sqlite3` Windows 预编译二进制安装成功、Electron 31.6.0 下载完成并进入 `packaging` 阶段，卡在 `winCodeSign` 工具包解压的符号链接权限问题（已定位为 electron-builder 在 Windows 上的通病，与项目代码无关，修复方法见五、风险）。顺手把 `postinstall` 从 `electron-rebuild` 换成 electron-builder 官方推荐的 `install-app-deps`（其日志主动提示了这一点），移除多余的 `@electron/rebuild` 依赖 |
| 2026-09-28 | #3（续） | 用户开启开发者模式后复测：`npm run build:win` 成功产出 exe；`npm run dev` 窗口正常弹出，工作台页面读写测试行正常（渲染进程→preload→主进程 IPC→better-sqlite3 全链路打通）。**M0 全部验收项通过，正式关闭**，转入 M1 |
| 2026-09-28 | #3（续二） | 修正一个跨会话文档 bug：`PROGRESS.md`/`docs/06`/`docs/08` 里之前写死了具体分支名 `arena/01a0e81b-courseschedulingsystem`，但 Arena 每个新会话都会自动分配一条新分支（是上一个会话分支的延续），导致新会话按文档提示词去"切换"到旧分支名时失败。已把三处文档里的硬编码分支名全部改成"跟随当前会话分配的分支，不写死名字"，并在 08 的故障排查表里补了这条已知现象 |

---

## 七、下个会话的第一条指令

M0 已关闭，下一个里程碑是 M1。新会话直接说：

```
这是一个跨会话的项目。请先读 PROGRESS.md、docs/08-会话交接指南.md、
docs/06-开发计划.md 中 M1 对应章节，然后 git log --oneline -10 看最近提交，
复述这次要做什么、验收标准、注意事项，等我确认后再开始写代码。

执行 M1 数据层与基础数据。DDL 直接用 docs/03-数据模型设计.md 第 3 章，一字不改。
```
