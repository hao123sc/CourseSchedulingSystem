# 项目进度台账

> **本文件是项目状态的唯一事实来源（Single Source of Truth）。**
> 每个会话开始时必须先读本文件；每个会话结束前必须更新本文件并提交。
> 最后更新：2026-09-29 · **M2 教学任务与规则已完成**（教学任务矩阵 + 四层规则网格 + 学科规则 + 预排锁定 + 约束组 + SolverInput 组装与自检 + `npm run seed:m2` **示范高完中**验收数据）。沙箱侧：typecheck/lint/build/prettier 全绿，单测 49 条纯逻辑用例通过；迁移 005、5 个 Repository 的真实 SQL、种子脚本与 `validateSolverInput` 均经真实 SQLite 引擎跑通（见变更日志 #6 的验证手法）。Electron 起窗口与 UI 手测留待用户真机。M2 收尾提交 `4f1b03a`；测试数据（`seed:test` / `seed:m2` / 单测 fixture）已统一到示范高完中；新增 `npm run test:sqlite` 兜底，沙箱内 **69/69 全部通过**（含此前被 skip 的 20 条数据层集成用例）

---

## 一、当前状态

| 项 | 值 |
|---|---|
| **当前阶段** | **M2 教学任务与规则已完成** |
| **下一个里程碑** | **M3 · 排课引擎 v1（无冲突）** |
| **工作分支** | 由 Arena 按会话自动分配（形如 `arena/xxxxxxxx-courseschedulingsystem`）。⚠️ 会话 #4 拿到的分支是从更早的**纯文档提交**派生的，**不含 M0 代码**；M0 代码在同级会话分支 `arena/01a0e87b`（tip `d4102d6`）。已在本分支上 `git merge --ff-only` 快进合并 M0 后再做 M1。若后续会话又遇到"分支缺上一步代码"，同样用 ff-merge 把上一会话分支并进来，**不要切换分支** |
| **PR** | https://github.com/hao123sc/CourseSchedulingSystem/pull/1 |
| **代码行数** | ~12810 行 TS/TSX + 488 行 SQL（`src/**`）+ 883 行种子脚本（`scripts/**`） |
| **仓库体积** | ~2.2MB（不含 node_modules/out/.git） |

---

## 二、里程碑进度

| 里程碑 | 状态 | 完成日期 | 备注 |
|---|---|---|---|
| 设计阶段 | ✅ 完成 | 2026-09-28 | 8 份文档 + 3 份视觉稿 |
| **M0 · 工程骨架** | ✅ 完成 | 2026-09-28 | 用户在 Win11 真机验证：`npm run dev` 弹窗正常、工作台读写测试行正常、`npm run build:win` 成功出 exe。沙箱侧验证记录见六、变更日志 #2/#3 |
| **M1 · 数据层与基础数据** | ✅ 完成 | 2026-09-29 | 全量 DDL（`001_init.sql`，逐字取自 docs/03 §3）+ 迁移执行器 + 内置种子（3 学段/默认作息、19 学科含配色、3 档权重）+ 9 个 Repository + 全部 IPC + 页面（学校设置/学段作息/年级班级含批量生成 20 班/学科/教师/教室）+ 通用 `EntityTable` + 教师/班级/教室 Excel 导入导出（exceljs）。沙箱验证见变更日志 #4；Electron 起窗口/真机手测留待用户 |
| **M2 · 教学任务与规则** | ✅ 完成 | 2026-09-29 | 迁移 `005_m2_rules.sql`（含 `ux_time_rule_global` 条件唯一索引）+ 5 个 Repository + 三组 IPC（teaching/rules/solver）+ `MatrixEditor`（Excel 式键盘 + 框选批量填充 + 行列合计超额标黄）+ 课时方案一键套用（内置 8 套，按国标推算，可预览改数字）+ 教师指派器与工作量看板 + `RuleGrid` 四层规则拖刷 + 学科规则 + 预排锁定 + 约束组 CRUD + `SolverInput` 纯类型/组装器/自检。验收数据 `npm run seed:m2`（**示范高完中**：初中 3 年级 + 高中 3 年级各 20 班 = 120 班，两套作息同时在跑）。沙箱验证见变更日志 #6/#7；Electron 起窗口与 UI 手测留待用户 |
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
| 🟡 中（新增 2026-09-29） | **`validateSolverInput` 的"容量估算"只是粗筛，不等于有解**。它只验证「班级需求节次 ≤ 可用时段」这类一维必要条件，不考虑教师/场地交叉耦合，因此 `ok=true` 仍可能排不出课 | M3 引擎必须自带真正的可行性判定与冲突归因；自检页的绿灯文案已写明"只是必要条件"，M3 起把引擎的不可行原因回填到同一张报告上 |
| 🟡 中（新增 2026-09-29） | **规则数据量随作用域爆炸**：240 班 × 40 槽 = 9600 行/班级层，四层叠加后单学期可达数万行 | 已做两道防线：① `NORMAL` 视为"无规则"直接删行不落库；② 005 迁移补了 `ix_time_rule_lookup`/`ux_time_rule_global` 索引。M3 组装 `SolverInput` 时按 slot 建索引（`indexRulesBySlot`）一次性摊平，引擎内不得再做线性扫描 |
| 🟡 中（新增 2026-09-29） | **高完中是两套作息并行**：初中 40 槽/周、高中 65 槽/周（含 5 格早读 + 15 格晚自习），同一学期里两组 `time_slot` 并存 | 凡是按「星期 × 节次」建位图/数组的地方，**必须按 stage 分桶**，不能用一个全局 `dayOfWeek*periodsPerDay+period` 索引；`SolverStage.slotIds` 已经按学段给好了各自的时段全集，M3 直接用它切分搜索空间 |
| 🟢 已澄清（2026-09-29） | 曾怀疑 `xxxRepo.upsert` 的 `.run({ ...params, id })` 给 UPDATE 传了多余的命名参数（`semesterId` 未出现在 SET 子句里）会报错 | 查 `better-sqlite3` C++ 源码（`binder.lzz` → `better_sqlite3.cpp`）确认：它只遍历 SQL 里出现的占位符取值，**多余的对象 key 会被忽略**，仅缺失时才抛 `Missing named parameter`。故现有写法安全，**不要"顺手修"**。注意 Node 内置 `node:sqlite` 在这点上更严格，拿它做验证脚手架时需自行过滤 key |

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
| 2026-09-29 | #5 | **M1 收尾增强（非里程碑新增功能，用户临时追加）**。① 测试数据脚本 `scripts/seed-test-data.cjs` + `npm run seed:test`（幂等；xxx中学/完全中学/6 年级×20 班=120 班每班 45 人/田径场并发 5/200 名教师 T001–T200 各配 1 学科/每班一间同名专属普通教室并设为固定教室 home_room/为 120 个班各指定一名班主任 T001.. 依次一师一班）。修过一个路径 bug（改用 `__dirname` 定位项目根，避免 `electron scripts/xx.cjs` 直跑时 `app.getAppPath()` 解析到 `scripts/` 导致 ENOENT）。② UI：`GradeClassTab` 班级编辑弹窗新增「班主任」下拉；修复编辑班级时因未回传 `homeRoomId` 导致固定教室被 upsert 清空的 bug（现表单初始化并回传 `homeRoomId`/`headTeacherId`）；表格新增班主任列。③ `EntityTable` 新增通用 `bulkActions` 渲染插槽（选中行后触发自定义批量操作），年级班级页据此支持「批量指定/清除班主任」。全部经 typecheck/lint/build/prettier 校验；种子逻辑经 Python sqlite3 跑真实迁移验证（120 班全部分配不同班主任、FK 无异常、重复运行加量为 0）。分支 tip `1caa1b9` |
| 2026-09-29 | #4 | **M1 数据层与基础数据完成**。① 先发现本会话分支派生自纯文档提交、不含 M0 代码，M0 在同级分支 `arena/01a0e87b`（`d4102d6`）——用 `git merge --ff-only` 快进并入 M0，未切换分支。② `migrations/001_init.sql` 全量建表（**逐字取自 docs/03 §3**）；`002~004` 种子（三学段+默认作息、19 学科含配色、3 档 S1~S15 权重取自 docs/04 §1.3）；`migrate.ts` 迁移器（`schema_version` 记录、逐迁移单事务、`?raw` 把 SQL 内联进主进程产物）。③ 9 个 Repository + 全部 IPC（通道类型均声明于 `shared/types/ipc.ts`）。④ 页面：学校设置 / 学段与作息编辑器 / 年级班级（批量生成 20 班+命名模板预览）/ 学科（配色）/ 教师（任教学科多选）/ 教室（双容量）；通用 `EntityTable`（排序/搜索/分页/批量删除）；教师/班级/教室 Excel 导入导出（新增依赖 **exceljs**，已获用户同意）；toast/modal UI 基元。⑤ 已确认设计细节：初中默认作息=上午5+下午3=8 节/天、5 天制（docs 只给了小学 7、高中 13，初中空白，经用户确认）。**沙箱验证**：typecheck/lint/build 全绿；DDL+种子经真实 SQLite 引擎（Python sqlite3）校验、`?raw` SQL 确认已打进 `out/main/index.js`；新增 `repositories.test.ts` 覆盖迁移+种子+全 Repository（含 3 年级×20 班），因沙箱无法编译 better-sqlite3 原生模块而 `describe.skipIf` 跳过，**在有原生模块的机器/CI 会实际运行**。Electron 起窗口与真机手测留给用户 |
| 2026-09-29 | #6 | **M2 教学任务与规则完成**。① 数据层：迁移 `005_m2_rules.sql`（查询索引 + 条件唯一索引 `ux_time_rule_global`，修掉原 `ux_time_rule` 因 `scope_id` 可空导致 global 规则可重复插入的洞）；5 个 Repository（`teachingTask`/`timeRule`/`fixedLesson`/`subjectRule`/`constraintGroup`）；`solverInputService` 组装 `SolverInput` 快照 + `checkSolverInput` 自检；三组 IPC（`teaching:*`/`timeRule:*`/`subjectRule:*`/`fixedLesson:*`/`constraintGroup:*`/`solver:buildInput`）。② 共享层：`shared/curriculumPresets.ts` 内置 8 套课时方案（义务教育课程方案 2022 版推算小学两段与初中三段、普通高中课程方案 2017 年版 2020 修订按必修学分折算），学科按**名称**匹配、匹配不上原样回报不静默丢弃；`shared/constraints/{ruleValue,fixedLesson}.ts` 承载四层规则合并与预排冲突判定（**引擎与渲染端共用的唯一一份**）。③ 引擎侧只落纯类型与纯校验：`solver/model/types.ts` + `validate.ts`（零 Node/Electron 依赖，18 种 issue code），Solution/Assignment 等求解侧建模留给 M3。④ 渲染层：教学任务页（`MatrixEditor` 方向键/Tab/Enter/F2/Ctrl+D 向下填充/Ctrl+C+V 整行复制/Shift+方向框选批量填充、行列合计、行合计超学段周总节次整行标黄；课时方案一键套用可预览改数字；教师指派器只列任教该科教师且超工作量者标红置底；右侧工作量看板实时预警）、排课规则页五个 Tab（`RuleGrid` 拖刷调色 + 五种作用域切换 + 分段分隔 + 已设规则数 + 清空/复制到同学科教师、学科规则、预排锁定、约束组、输入自检）。⑤ 验收数据：`npm run seed:m2`（`scripts/seed-m2-demo.cjs`，幂等）铺出示范初中 60 班 / 121 名教师 / 780 条教学任务 1880 节 / 142 条四层规则 / 63 条预排 / 3 个约束组。**沙箱验证手法（新）**：因无法编译 `better-sqlite3` 原生模块，改用 Node 22 内置 `node:sqlite` 写了一次性脚手架（`/tmp`，已删），**只替换 sqlite 驱动**，直接跑真实的迁移 001~005、真实种子脚本、真实 5 个 Repository、真实 `solverInputService` 与 `validateSolverInput`：repo 断言 41 条全过，种子两次运行计数完全一致（幂等），最终 `validateSolverInput` 返回 `ok=true`、**零 issue**，即"数据可完整读出为 SolverInput"验收达成。过程中借此抓到并修掉 3 个种子脚本真 bug（教师池按整班课时不可拆分重算、不足时就地扩招 → 零未指派任务；连堂改挂在语文；班会占位与初三禁排时段撞格）。typecheck/lint/build/prettier 全绿，`npx vitest run` 49 条纯逻辑用例通过（`connection.test.ts` 因缺原生模块报红、`repositories.test.ts`/`m2Repositories.test.ts` 自动 skip，均为沙箱已知现象）。分支 tip `ca39759` |
| 2026-09-29 | #7 | **M2 验收基准由「示范初中」改为「示范高完中」（用户修正）**，并同步修文档。① `scripts/seed-m2-demo.cjs` 重写成学段驱动：学校 `school_type='complete'`，初一/初二/初三 + 高一/高二/高三各 20 班 = **120 班**，小学学段停用；初中部/高中部**分开建教师池**（名字前缀 初/高，共 256 人，人人 ≤18 节/周）；课时方案用初中三套 + 高中三套（均去掉「班会」，改由预排占位承担）；**高中作息角色全部从库里的 `segment`+`period_name` 推导**（早读/上午正课/下午正课/晚自习），用户改过作息脚本依然成立，不写死节次编号。② 高中特有建模：每天早读 + 每天 3 节晚自习按**整年级预排占位**（`fixed_lesson.grade_id`）铺满 20 格/周，把高中的可排窗口从 65 格收到 45 格——对 M3 才是有意义的紧约束；早读只留给语文/英语，其余 14 个在用学科在早读时段一律 `FORBIDDEN`。③ 约束组改成跨部案例：教师互斥组一头初中部一头高中部、合班拼合改为高一 19/20 班通用技术。④ 修掉一个连堂 bug（原给 1 节/周的通用技术挂了 1×2 连堂，触发 20 条 `TASK_CONSECUTIVE` error；改成语文 + 高中信息技术，并加 `periods >= 2` 前置判断）。**沙箱验证**（同 #6 的 `node:sqlite` 脚手架，真实种子 + 真实 `solverInputService` + 真实 `validateSolverInput`）：幂等复跑计数一致，`ok=true` **零 issue**，120 班 / 1520 条任务 3900 节 / 373 条规则 / 186 条预排 / 3 个约束组 / 141 间教室；最紧的班——初三 需 34 可用 38、高三 需 57 可用 63，均有余量。⑤ 文档同步：`docs/06` M2 验收与 M8 种子数据、`docs/03 §5` 示例学校表（新增 `complete 示范高完中` 行并把"主演示"移交给它，原三套单学段预设保留为备选）、`docs/00` 演示数据策略（加注 2026-09-29 修订说明，不改写原决策记录）、`docs/05` 首启动画面示例选项、`docs/next-session-M2.md` 验收标准。M2 收尾提交 `4f1b03a` |
| 2026-09-29 | #8 | **测试数据全面对齐示范高完中**（用户指令：更新对应的测试数据）。① 新增 `scripts/lib/demo-school.cjs`——**基础数据的唯一定义**（学校/学期/学段启用/年级班级/教室场地/教师编制/班主任，外加按课时方案推导的「班 × 学科 × 周课时 × 任课教师」清单，只计算不写库），`seed:test` 与 `seed:m2` 一起 require 它，从此不可能再各建各的。② `seed:test` 回归 M1 口径**只铺基础数据**（此前它还停在 `xxx中学` + 200 名按顺序轮转学科的教师，与 M2 基准完全脱节）：现为示范高完中 120 班 / 256 名教师 / 120 名班主任（均任教本班）/ 141 间教室，教师改用**真实中文姓名**（20 姓 × 14 名组合，256 人无重名）、工号 `T0001` 起连续、按学科分池而非轮转。③ `seed:m2` 瘦身为只负责 M2 层（教学任务 / 四层时段规则 / 学科规则与场地绑定 / 预排锁定 / 约束组）。④ 单测 fixture 同步：`m2Repositories.test.ts` 由纯初中改为**初中部 + 高中部各 3 年级 × 4 班 = 24 班**，并新增 2 条两学段并存用例（高中课时方案套用后不污染初中班、两学段时段规则互不串台且 `SolverStage.slotIds` 按学段切分）；`repositories.test.ts` 学校单例用例改 `示范高完中/complete`。**沙箱验证**：除 `node:sqlite` 脚手架的 16 条种子断言全绿（两脚本各自幂等、可任意先后混跑、基础数据逐字节一致、`validateSolverInput` 仍 `ok=true` 零 error）外，本轮还发现只要给 vitest 挂一个把 `better-sqlite3` 别名到 `node:sqlite` 壳的临时 config（**临时文件用完即删，未入库**），**平时被 skip 的 20 条数据层集成用例可以在沙箱真跑**——`npx vitest run` 9 个测试文件 **69/69 全部通过**，即新写的两学段用例是真的验过、不是只过了类型检查。typecheck / eslint / prettier 全绿。分支 tip `1eca2c3` |
| 2026-09-29 | #9 | **新增 `npm run test:sqlite`（用户拍板固化）**。把 #8 里临时验证用的驱动替换做成仓库正式能力：`scripts/test/node-sqlite-driver.cjs`（基于 Node 22.5+ 内置 `node:sqlite` 的 better-sqlite3 兼容壳，抹平 `pragma()` / 可调用 `transaction()` 且支持嵌套 / `undefined→null` / `boolean→0/1` / null 原型行转普通对象 / **按 SQL 文本过滤多余命名参数**这几处 API 形状差异，并劫持 `Module._load` 让测试里的原生模块探针也走它）+ `vitest.sqlite.config.ts`（`mergeConfig` 复用 `vitest.config.ts`，只加 alias 与 setupFiles）。**只换驱动、不动任何产品代码**，跑的仍是真实迁移 001~005、真实 Repository、真实 `solverInputService`。效果：`npm test` 在沙箱仍是 49 passed / 19 skipped / 1 failed（无原生模块，既有行为不变），`npm run test:sqlite` 则 **9 个文件 69/69 全过**。文档同步：README 补命令块与演示数据脚本说明、修掉 README 里"当前进入 M1"的过期状态（改为 M0/M1/M2 已完成、下一步 M3）、docs/08 §8 排障表写明用法与"它是兜底不是等价物，有原生模块请以 `npm test` 为准"。⚠️ 仍需注意：生产运行时用的依旧是 `better-sqlite3`，该命令不替代真机验证。分支 tip 见下方提交 |

---

## 七、下个会话的第一条指令

M2 已关闭，下一个里程碑是 M3。新会话直接说：

```
这是一个跨会话的项目。请先读 PROGRESS.md、docs/08-会话交接指南.md、
docs/04-排课算法设计.md 与 docs/06-开发计划.md 中 M3 对应章节，
然后 git log --oneline -10 看最近提交，复述这次要做什么、验收标准、
注意事项，等我确认后再开始写代码。

执行 M3 排课引擎 v1（无冲突）。输入已经就绪：主进程 solverInputService
能把整个学期组装成 SolverInput 快照，src/solver/model/types.ts 是它的纯类型，
validate.ts 是入口自检；用 npm run seed:m2 可以一键铺出**示范高完中**的验收数据
（初中+高中共 120 班 / 1520 条教学任务 3900 节 / 373 条四层规则 /
186 条预排占位 / 3 个约束组，两套作息同时在跑）。
先把 D3 定的 AC-3 预处理 → DSATUR 构造这两段做出来，目标是
H1~H11 硬约束零违反、**能同时排完初中部与高中部共 120 班**，软约束优化留给 M5。
```

> 提醒：
> 1. 若新会话分支缺上一步代码，先 `git ls-remote --heads origin` 找到含最新代码的
>    同级会话分支，`git merge --ff-only` 并入当前分支，**不要切换分支**。
> 2. 沙箱无法编译 `better-sqlite3` 原生模块：`connection.test.ts` 会报红、
>    `repositories.test.ts` / `m2Repositories.test.ts` 会自动 skip——已知现象，真机/CI 正常。
>    M3 的引擎代码是纯 TS 零 IO，**不受这条限制，单测必须真跑真绿**。
> 3. `src/solver/**` 禁止 import Electron/Node 模块（worker 入口除外）；
>    冲突判定逻辑只有 `src/shared/constraints` 一份，引擎直接复用，不要另写一套。
