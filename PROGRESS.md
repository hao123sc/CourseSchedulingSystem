# 项目进度台账

> **本文件是项目状态的唯一事实来源（Single Source of Truth）。**
> 每个会话开始时必须先读本文件；每个会话结束前必须更新本文件并提交。
> 最后更新：2026-09-28 · M0 用户本地 Windows 验证进行中，仅剩 winCodeSign 符号链接权限问题

---

## 一、当前状态

| 项 | 值 |
|---|---|
| **当前阶段** | M0 代码完成，用户已在真实 Win11 机器上验证：`npm run build` 编译产物正常、better-sqlite3 Windows 预编译二进制安装成功、Electron 31.6.0 已下载并进入打包阶段；仅剩 `electron-builder` 下载的 `winCodeSign` 工具包因 Windows 符号链接权限不足解压失败，**待用户开启开发者模式/管理员权限重试后反馈** |
| **下一个里程碑** | M0 收尾（收到用户 exe 打包成功反馈后关闭）→ **M1 · 数据层与基础数据** |
| **工作分支** | `arena/01a0e81b-courseschedulingsystem`（固定，勿切换） |
| **PR** | https://github.com/hao123sc/CourseSchedulingSystem/pull/1 |
| **代码行数** | ~770 行（`src/**/*.ts(x)`，不含 node_modules） |
| **仓库体积** | ~2.0MB（不含 node_modules/.git） |

---

## 二、里程碑进度

| 里程碑 | 状态 | 完成日期 | 备注 |
|---|---|---|---|
| 设计阶段 | ✅ 完成 | 2026-09-28 | 8 份文档 + 3 份视觉稿 |
| **M0 · 工程骨架** | 🟡 进行中 | 2026-09-28 代码完成 | 沙箱内验证 + 用户 Win11 真机验证均已过半；**只差 winCodeSign 符号链接权限这一个问题**，见五、风险 |

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
4. **分支**：只在 `arena/01a0e81b-courseschedulingsystem` 上工作，不切换、不新建分支
5. **提交**：每个里程碑内的逻辑单元独立提交，信息用 `feat(模块): 说明` 格式
6. **收尾**：会话结束前更新本文件的「当前状态」「里程碑进度」「变更日志」并提交推送

---

## 五、已知风险与注意事项

| 级别 | 事项 | 应对 |
|---|---|---|
| 🔴 致命 | `better-sqlite3` 是原生模块，Electron 打包易失败 | **M0 就要跑通 `electron-rebuild` + `asarUnpack` + 实际打出 exe**，不可延后。**现状（2026-09-28）：代码/配置已就绪（`electron-builder.yml` 已配 `asarUnpack`），但沙箱网络无法下载 Electron 二进制/headers/electron-builder 工具链，未能在本会话内实际打出 exe，见下条** |
| 🔴 致命 | **本 AI 沙箱出网白名单不含 GitHub Release CDN**（`release-assets.githubusercontent.com`/`objects.githubusercontent.com`/`artifacts.electronjs.org`/`nodejs.org`/npmmirror 等均连接失败，仅 `registry.npmjs.org`、`github.com`/`api.github.com`/`codeload.github.com`、pypi 等少数域名可用） | 凡涉及下载 Electron 运行时二进制、Electron headers（`electron-rebuild` 用）、electron-builder 打包工具（nsis/7za/winCodeSign）的步骤，**必须由用户在有完整外网的机器（或 CI）上跑**，不能在本沙箱内完成。已把可复现的替代验证方式写进 `README.md`「本地开发/打包」一节（用本机 Node headers 编译 better-sqlite3 并跑通生产代码路径的读写测试）。**每个新会话遇到需要真机验证的步骤，先如实告知这一限制，不要假装验证通过。** |
| 🟡 中（已定位，待用户复测） | Windows 上 `npm run build:win` 卡在下载的 `winCodeSign-2.6.0.7z` 解压：`Cannot create symbolic link`（压缩包内含 macOS dylib 符号链接，普通 Windows 用户默认无创建符号链接权限） | 这是 electron-builder 在 Windows 上的已知通病，与本项目代码无关。修复：① 开启 Win11「开发者模式」（设置→隐私和安全性→开发者选项）后清空 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` 重试；② 或以管理员身份运行终端。2026-09-28 用户首次本地实测已确认到这一步——**说明 Electron 下载、better-sqlite3 Windows 预编译二进制安装、`npm run build` 编译产物全部正常**，只差这一个签名工具解压问题 |
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
| 2026-09-28 | #3 | 用户在真实 Win11 机器上首次执行 `npm run build:win`：`electron-vite build` 产物正常、`better-sqlite3` Windows 预编译二进制安装成功、Electron 31.6.0 下载完成并进入 `packaging` 阶段，卡在 `winCodeSign` 工具包解压的符号链接权限问题（已定位为 electron-builder 在 Windows 上的通病，与项目代码无关，修复方法见五、风险）。顺手把 `postinstall` 从 `electron-rebuild` 换成 electron-builder 官方推荐的 `install-app-deps`（其日志主动提示了这一点），移除多余的 `@electron/rebuild` 依赖。**`npm run dev` 是否能正常弹窗仍待用户确认** |

---

## 七、下个会话的第一条指令

**如果用户已经在本地跑过 `npm install && npm run dev` / `npm run build:win`（或 `build:linux`）并反馈了结果：**

```
读 PROGRESS.md。上个会话把 M0 代码写完了，我在本地跑了 npm install / npm run dev / npm run build:xxx，
结果是：<贴运行结果或报错>。请据此收尾 M0（更新 PROGRESS.md 验收状态），
如果本地验证通过就正式关闭 M0，转入 M1；如果有报错就先修。
```

**如果用户还没来得及在本地验证：**

```
读 PROGRESS.md 和 docs/08-会话交接指南.md。M0 代码已完成但 exe 打包验证还没有用户反馈，
先别急着推进 M1，帮我 review 一下 M0 现有代码是否完整、有没有遗漏，等我这边跑完本地验证再继续。
```
