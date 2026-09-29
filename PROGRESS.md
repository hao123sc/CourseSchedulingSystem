# 项目进度台账

> **本文件是项目状态的唯一事实来源（Single Source of Truth）。**
> 每个会话开始时必须先读本文件；每个会话结束前必须更新本文件并提交。
> 最后更新：2026-09-29 · **M1 已完成并追加收尾增强**（测试数据种子脚本、班主任编辑/批量指定、固定教室保护修复）。沙箱侧：typecheck/lint/build 全绿，DDL 与迁移经真实 SQLite 引擎校验；集成测试在有原生模块的机器/CI 上跑，沙箱因网络限制自动 skip。分支 tip `1caa1b9`

---

## 一、当前状态

| 项 | 值 |
|---|---|
| **当前阶段** | **M1 数据层与基础数据已完成** |
| **下一个里程碑** | **M2 · 教学任务与规则** |
| **工作分支** | 由 Arena 按会话自动分配（形如 `arena/xxxxxxxx-courseschedulingsystem`）。⚠️ 本会话（#4）拿到的分支是从更早的**纯文档提交**派生的，**不含 M0 代码**；M0 代码在同级会话分支 `arena/01a0e87b`（tip `d4102d6`）。已在本分支上 `git merge --ff-only` 快进合并 M0 后再做 M1。若后续会话又遇到"分支缺上一步代码"，同样用 ff-merge 把上一会话分支并进来，**不要切换分支** |
| **PR** | https://github.com/hao123sc/CourseSchedulingSystem/pull/1 |
| **代码行数** | ~5150 行 TS/TSX + 458 行 SQL（`src/**`，不含 node_modules） |
| **仓库体积** | ~1.8MB（不含 node_modules/.git） |

---

## 二、里程碑进度

| 里程碑 | 状态 | 完成日期 | 备注 |
|---|---|---|---|
| 设计阶段 | ✅ 完成 | 2026-09-28 | 8 份文档 + 3 份视觉稿 |
| **M0 · 工程骨架** | ✅ 完成 | 2026-09-28 | 用户在 Win11 真机验证：`npm run dev` 弹窗正常、工作台读写测试行正常、`npm run build:win` 成功出 exe。沙箱侧验证记录见六、变更日志 #2/#3 |
| **M1 · 数据层与基础数据** | ✅ 完成 | 2026-09-29 | 全量 DDL（`001_init.sql`，逐字取自 docs/03 §3）+ 迁移执行器 + 内置种子（3 学段/默认作息、19 学科含配色、3 档权重）+ 9 个 Repository + 全部 IPC + 页面（学校设置/学段作息/年级班级含批量生成 20 班/学科/教师/教室）+ 通用 `EntityTable` + 教师/班级/教室 Excel 导入导出（exceljs）。沙箱验证见变更日志 #4；Electron 起窗口/真机手测留待用户 |
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
| 2026-09-29 | #5 | **M1 收尾增强（非里程碑新增功能，用户临时追加）**。① 测试数据脚本 `scripts/seed-test-data.cjs` + `npm run seed:test`（幂等；xxx中学/完全中学/6 年级×20 班=120 班每班 45 人/田径场并发 5/200 名教师 T001–T200 各配 1 学科/每班一间同名专属普通教室并设为固定教室 home_room/为 120 个班各指定一名班主任 T001.. 依次一师一班）。修过一个路径 bug（改用 `__dirname` 定位项目根，避免 `electron scripts/xx.cjs` 直跑时 `app.getAppPath()` 解析到 `scripts/` 导致 ENOENT）。② UI：`GradeClassTab` 班级编辑弹窗新增「班主任」下拉；修复编辑班级时因未回传 `homeRoomId` 导致固定教室被 upsert 清空的 bug（现表单初始化并回传 `homeRoomId`/`headTeacherId`）；表格新增班主任列。③ `EntityTable` 新增通用 `bulkActions` 渲染插槽（选中行后触发自定义批量操作），年级班级页据此支持「批量指定/清除班主任」。全部经 typecheck/lint/build/prettier 校验；种子逻辑经 Python sqlite3 跑真实迁移验证（120 班全部分配不同班主任、FK 无异常、重复运行加量为 0）。分支 tip `1caa1b9` |\n| 2026-09-29 | #4 | **M1 数据层与基础数据完成**。① 先发现本会话分支派生自纯文档提交、不含 M0 代码，M0 在同级分支 `arena/01a0e87b`（`d4102d6`）——用 `git merge --ff-only` 快进并入 M0，未切换分支。② `migrations/001_init.sql` 全量建表（**逐字取自 docs/03 §3**）；`002~004` 种子（三学段+默认作息、19 学科含配色、3 档 S1~S15 权重取自 docs/04 §1.3）；`migrate.ts` 迁移器（`schema_version` 记录、逐迁移单事务、`?raw` 把 SQL 内联进主进程产物）。③ 9 个 Repository + 全部 IPC（通道类型均声明于 `shared/types/ipc.ts`）。④ 页面：学校设置 / 学段与作息编辑器 / 年级班级（批量生成 20 班+命名模板预览）/ 学科（配色）/ 教师（任教学科多选）/ 教室（双容量）；通用 `EntityTable`（排序/搜索/分页/批量删除）；教师/班级/教室 Excel 导入导出（新增依赖 **exceljs**，已获用户同意）；toast/modal UI 基元。⑤ 已确认设计细节：初中默认作息=上午5+下午3=8 节/天、5 天制（docs 只给了小学 7、高中 13，初中空白，经用户确认）。**沙箱验证**：typecheck/lint/build 全绿；DDL+种子经真实 SQLite 引擎（Python sqlite3）校验、`?raw` SQL 确认已打进 `out/main/index.js`；新增 `repositories.test.ts` 覆盖迁移+种子+全 Repository（含 3 年级×20 班），因沙箱无法编译 better-sqlite3 原生模块而 `describe.skipIf` 跳过，**在有原生模块的机器/CI 会实际运行**。Electron 起窗口与真机手测留给用户 |

---

## 七、下个会话的第一条指令

M1 已关闭，下一个里程碑是 M2。新会话直接说：

```
这是一个跨会话的项目。请先读 PROGRESS.md、docs/08-会话交接指南.md、
docs/06-开发计划.md 中 M2 对应章节，然后 git log --oneline -10 看最近提交，
复述这次要做什么、验收标准、注意事项，等我确认后再开始写代码。

执行 M2 教学任务与规则。重点是 MatrixEditor 的 Excel 式键盘操作和
RuleGrid 的拖刷交互，这两个决定录入效率。
```

> 提醒：若新会话分支又缺上一步代码（本会话遇到过），先 `git ls-remote --heads origin`
> 找到含最新代码的同级会话分支，`git merge --ff-only` 并入当前分支，**不要切换分支**。
> 另：沙箱无法编译 `better-sqlite3` 原生模块，`connection.test.ts` 会因此报红、
> `repositories.test.ts` 会自动 skip——这是沙箱网络限制的已知现象，在真机/CI 上正常。
