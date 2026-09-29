# 智课排 · 中小学全学段智能排课系统（单机版）

一款免安装、零配置的桌面排课软件，覆盖**小学 / 初中 / 高中**三学段，支持每年级 20+ 班级、全动态年级班级结构，数秒内生成无冲突且经得起推敲的高质量课表。

- **形态**：Electron 单机桌面应用，双击即用，数据存本地 SQLite
- **规模**：设计容量 12 年级 × 20 班 = 240 教学班
- **引擎**：AC-3 预处理 → DSATUR 图着色构造 → ALNS 自适应大邻域搜索 → LAHC 精修 → 规则化抛光
- **交互**：拖拽换课、实时冲突检测、智能换课建议、课表体检报告、Excel/PDF/PNG 导出

## 跨会话开发

本项目分多个会话完成开发。**新会话开始前请先读 [`PROGRESS.md`](PROGRESS.md)（进度台账，唯一事实来源）与 [`docs/08-会话交接指南.md`](docs/08-会话交接指南.md)（含即用提示词模板）。**

## 文档

| 文档 | 内容 |
|---|---|
| [00 方案对标与决策纪要](docs/00-方案对标与决策纪要.md) | 案例对标、取舍边界、关键决策 |
| [01 需求规格说明书](docs/01-需求规格说明书.md) | 功能清单（MoSCoW）、非功能需求、验收标准 |
| [02 系统架构设计](docs/02-系统架构设计.md) | 三进程模型、技术栈、目录结构、IPC 设计 |
| [03 数据模型设计](docs/03-数据模型设计.md) | ER 模型、完整 SQLite DDL、索引与种子数据 |
| [04 排课算法设计](docs/04-排课算法设计.md) | 约束形式化、求解流水线、算子库、增量评分 |
| [05 界面与交互设计](docs/05-界面与交互设计.md) | 视觉规范、页面设计、课表网格与拖拽交互 |
| [06 开发计划](docs/06-开发计划.md) | M0~M9 里程碑拆分与验收 |
| [07 排课算法选型菜单](docs/07-排课算法选型菜单.md) | 18 种候选算法全景、原理与选型依据 |
| [08 会话交接指南](docs/08-会话交接指南.md) | 跨会话开发流程、提示词模板、质量守门 |
| [PROGRESS.md](PROGRESS.md) | **进度台账 · 唯一事实来源** |
| [视觉稿](docs/mockups/) | 课表页 / 体检报告 / 全校总表（单文件零依赖 HTML） |
| [参考资料](docs/reference/) | 两份业界案例原文 + 规则完备性调研 |

## 开发状态

✅ **M0 · 工程骨架**：已完成并通过 Win11 真机验收（`npm run dev` 正常弹窗、DB 读写正常、`npm run build:win` 成功出 exe）。当前进入 **M1 · 数据层与基础数据**。详见 [`PROGRESS.md`](PROGRESS.md)。

## 本地开发 / 打包（首次务必在有完整外网的机器上执行）

> ⚠️ 本仓库的自动化开发沙箱**出网白名单不含 GitHub Release 资源域名**
> （`release-assets.githubusercontent.com` / `objects.githubusercontent.com` / `artifacts.electronjs.org` / `nodejs.org`），
> 无法下载 Electron 运行时二进制、Electron headers、electron-builder 的打包工具（nsis/7z 等）。
> 因此 `npm run dev` 起窗口、`electron-rebuild`、`electron-builder` 出 exe 这三件事**均未能在沙箱内验证**，
> 已在沙箱内验证过的部分见下方"沙箱内已验证"。首次拉到本地后请按顺序跑一遍并把结果反馈回来。

```bash
# 1. 安装依赖（会自动触发 postinstall: electron-rebuild -f -w better-sqlite3）
npm install

# 2. 起开发窗口：应看到左侧导航 + 工作台页面，可切换深浅色主题
#    工作台页面会自动调用 IPC 读写 SQLite 的 health_check 表，
#    页面上出现"写入测试行"的输入框与列表即代表数据库读写链路打通
npm run dev

# 3. 单测 / 类型检查 / 代码规范（沙箱内已跑通，本地应同样全绿）
npm run test
npm run typecheck
npm run lint

# 4. 打正式包（任选其一，与你本机操作系统一致最省事）
npm run build:win     # Windows 机器上：产出 release-builds/ 下的 portable + Setup 两个 exe
npm run build:linux   # Linux 机器上：产出 AppImage / 目录版
```

**关于 Windows exe**：`electron-builder` 在打 Windows 包时会用 `rcedit` 给 exe 写图标/版本信息；
在 Windows 宿主机上原生打包不需要额外工具。若你想在 macOS/Linux 上**交叉编译** Windows 包，
需要额外装 `wine`（`brew install --cask wine-stable` 或 `apt install wine`），否则图标写入步骤会失败。
最稳妥的方式仍是**直接在 Windows 机器（或 GitHub Actions 的 `windows-latest` runner）上跑 `npm run build:win`**。

**沙箱内已验证**（不依赖 GitHub Release CDN，可复现）：
- `better-sqlite3` 用本机 Node 头文件（`node-gyp rebuild --nodedir=$(node -p process.execPath 所在前缀)`）从源码编译成功，且用与生产代码完全一致的 `src/main/db/connection.ts` 路径（mock 掉 `electron` 模块）跑通建库/建表/插入/查询，见 `src/main/db/connection.test.ts`
- `electron-vite build` 成功产出 `out/main`、`out/preload`（均为 CJS）、`out/renderer` 三份构建产物
- `npm run typecheck` / `npm run lint` / `npm run test` 全绿

**沙箱内未能验证、需要你反馈**：
- `npm run dev` 实际起窗口、页面可交互
- `electron-rebuild` 针对 **Electron 的 V8 ABI**（而非本机 Node 的 ABI）重新编译 `better-sqlite3` 是否成功
- `electron-builder` 打包出的 exe 双击后能否正常启动、读写 `%APPDATA%` 下的 SQLite 文件
