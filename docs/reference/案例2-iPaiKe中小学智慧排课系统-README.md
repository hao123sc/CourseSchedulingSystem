> **来源**：Gitee 仓库 `edunode/edunode-ipaike`（iPaiKe · 中小学智慧排课系统，AGPL-3.0），文件 `README.md`
> **抓取时间**：2026-09-28
> 本文件为参考资料原文留档，用于对标一套成熟产品的功能边界与引擎设计，**不作为本项目最终需求**。
> 注意：该项目为 AGPL-3.0 协议，本项目不复制其代码，仅借鉴需求与设计思路。

---

# iPaiKe · 中小学智慧排课系统

面向**完全中学（兼容小学 / 初中）**的智能排课系统。以 **CSP 约束求解 + 遗传算法优化**为核心引擎，覆盖从基础数据管理、自动排课、冲突检测、人工微调到课表发布与多端查看的完整教务闭环。

- **规模上限**：年级 ≤ 6，班级 ≤ 120（每级 ≤ 20 班）
- **排课模式**：整学期固定课表 / 单双周轮流课表（可按年级、按学科-班级分别配置）
- **排课粒度**：教学班级；走班课程抽象为「虚拟教学班」参与冲突约束

---

## 核心特性

### 基础数据

- 教师、班级、学科、教室、学生、年级的完整增删改查
- Excel 批量导入 / 导出，内置标准模板与逐行校验反馈
- 教学任务矩阵（班级 × 学科 × 教师 × 周课时）可视化编辑
- 学科-专用教室映射、教室类型与容量管理

### 排课引擎

- **CSP 约束求解**：硬约束（教师 / 班级 / 教室三元组冲突）100% 保证不冲突；降级求解含贪心分配 + min-conflicts 迭代修复 + 交换修复 + 分布优化
- **遗传算法优化**：在满足硬约束的可行解上优化软约束得分（教师集中度、学科分散度、时段偏好等）；含种子保底回退与局部搜索精修
- **学科分布均匀性**：C4 周内天间隔均匀度约束 + B1 教师日间方差惩罚 + CSP LCV 学科分散排序 + spreadTieBreak 教师日负载因子
- **四层时段规则值**：`FORBIDDEN`（硬禁） / `AVOID`（软避） / `NORMAL`（常规） / `PREFERRED`（优选）
- **A 类规则自检**：排课前检测规则组合是否自相矛盾，避免无解空转
- **异步任务化**：排课任务经 RabbitMQ 投递，支持进度查询、取消与任务看板

### 约束与规则

| 约束类型 | 说明 |
| :--- | :--- |
| 学科规则 | 每日上限、连堂上限、连堂允许星期、时段规则值、重要性等级 |
| 教师互斥组 | 硬互斥（同时段最多 1 人）/ 软互斥（限制并发人数）/ 跟随组（相邻节次联动） |
| 学科互斥组 | 指定学科集合不得同日 / 同时段出现 |
| 拼合组 | 多个班级的指定学科必须排在同一时段 |
| 同时上课组 | 跨班级课程强制对齐时段 |
| 单双周模式 | 学科-班级级别的单周 / 双周课时拆分，支持年级节次周模式与批量配置 |
| 课别（Class Type） | 自定义课程类别及其专属规则与配色 |

### 冲突检测与人工微调

- 三级冲突可视化（GREEN / YELLOW / RED）与冲突明细下钻
- 冲突处理模式 A/B/C：分别对应「禁止落子」「弹窗确认」「允许并标注」
- 拖拽换课、最小代价交换推荐、智能填充空位
- 连堂课合并 / 拆分、单元格锁定、备注标记
- 三种冲突判定模式可运行时切换，无需重启

### 课表查看与导出

- 班级课表、教师课表、全校总览多视图
- 教师课表「节次 × 星期」标准网格视图，支持单双周混合展示
- 打印模板（简版 / 详版 / 教师版 / 总览版）支持预览与 PDF 导出
- 全校总表智能分页：竖排按班级块分页、横排按天分页，保证内容不截断
- Excel 导出、配色方案自定义与一键重置
- 移动端（Vant）课表查看与检索
- 企业微信集成：扫码免登预览、消息推送

### 版本与运维

- 课表版本管理：父版本全量快照 + 子版本增量快照，支持嵌套、链式回滚、级联删除
- 版本完整性校验与损坏标记，分布式锁并发控制
- 操作审计日志（含操作人、目标表、变更内容）
- 数据中心：批量数据同步与同步日志
- Actuator 健康检查 + Prometheus 指标暴露
- Redisson 分布式锁保证并发排课安全

---

## 技术栈

### 后端

| 组件 | 版本 | 用途 |
| :--- | :--- | :--- |
| Java | 21 | 运行时 |
| Spring Boot | 3.2.5 | 应用框架 |
| Spring Data JPA | - | 持久层 |
| Spring Security + JWT | jjwt 0.12.5 | 认证授权 |
| PostgreSQL | 15 | 主数据库 |
| Redis + Redisson | 7 / 3.27.2 | 缓存与分布式锁 |
| RabbitMQ | 3.12 | 排课任务异步队列 |
| Apache POI | 5.2.5 | Excel 导入导出 |
| iText 7 | 7.2.5 | PDF 打印 |
| ZXing | 3.5.3 | 企业微信预览二维码 |

### 前端

| 组件 | 版本 | 用途 |
| :--- | :--- | :--- |
| Vue | 3.4 | 视图框架 |
| TypeScript | 5.4 | 类型系统 |
| Vite | 5.2 | 构建工具 |
| Element Plus | 2.7 | 桌面端 UI |
| Vant | 4.8 | 移动端 UI |
| Pinia | 2.1 | 状态管理 |
| Vue Router | 4.3 | 路由 |
| vxe-table | 4.6 | 课表网格 |
| vuedraggable | 4.1 | 拖拽微调 |

### 基础设施

Docker Compose（开发 / 单机部署）· Kubernetes 清单（集群部署）· Nginx 反向代理

---

## 项目结构（节选）

```
ipaike/
├── backend/                     # Spring Boot 后端（195+ 个 Java 类，52+ 个控制器）
│   └── src/main/java/com/pk/
│       ├── common/              # 统一响应 R、BizException、审计注解
│       ├── config/              # Web / Security / Redis / RabbitMQ / JPA 配置
│       ├── security/            # JWT 过滤器与用户上下文
│       └── module/
│           ├── base/            # 教师、班级、学科、教室、学生、教学任务
│           ├── schedule/        # 排课引擎、任务、冲突、微调、连堂
│           │   └── engine/      # CspModel / CspSolver / GaOptimizer / Scorer
│           ├── constraint/      # 教师互斥组、学科互斥组、拼合组
│           ├── classtype/       # 课别管理
│           ├── adjust/          # 人工微调与智能填充
│           ├── export/          # Excel / PDF 导出与打印模板
│           ├── template/        # 排课方案模板
│           ├── version/         # 课表版本管理（嵌套快照、链式回滚、级联删除）
│           ├── datacenter/      # 数据同步中心
│           ├── integration/     # 企业微信集成
│           └── system/          # 系统配置、规则配置、年级周模式、审计日志
├── frontend/                    # Vue 3 前端（36 个页面）
├── docker/                      # Docker Compose 编排
└── k8s/                         # Kubernetes 部署清单
```

---

## 模块与 API 概览

所有接口以 `/api` 为前缀，统一返回 `{ code, message, data }`。

| 分组 | 主要路径 |
| :--- | :--- |
| 认证 | `/auth` |
| 基础数据 | `/teachers` `/classes` `/subjects` `/classrooms` `/students` `/grades` `/teaching-assignments` `/teaching-matrix` |
| 导入导出 | `/import` `/export` |
| 排课 | `/schedule` `/schedule/tasks` `/schedule/self-check` `/schedule/diagnose` `/schedule/smart-fill` |
| 课表与微调 | `/schedule/timetable/{classId}` `/schedule/teacher-view` `/schedule/adjust` `/schedule/cell/{cellId}` `/schedule/cell/consecutive` `/timetable/remark` |
| 冲突 | `/schedule/conflict` `/config/conflict-mode` |
| 约束 | `/constraints` `/teachers/conflict-groups` `/subject-mutex-groups` `/schedule/splice-groups` `/schedule/simultaneous-groups` |
| 配置 | `/config/rules` `/config/school` `/config/week-mode` `/config/grade-week-mode` `/config/period-segments` `/config/importance` `/config/colors` `/config/weights` |
| 课别 | `/class-types` |
| 虚拟教学班 | `/virtual-class` `/subject-classroom-mapping` |
| 模板与版本 | `/templates` `/version` |
| 学科管理 | `/subjects` `/subject-grades` |
| 系统 | `/system` `/system/audit-logs` `/monitor` `/datacenter` `/search` |
| 集成 | `/integration/wework` |

---

## 排课引擎说明

```
教学任务 + 约束规则
        │
        ▼
  ┌─────────────┐   规则自检：检测硬约束是否自相矛盾
  │  SelfCheck  │   无解风险提前暴露，避免长时间空转
  └─────────────┘
        │
        ▼
  ┌─────────────┐   变量：班级 × 学科 × 课时
  │  CspModel   │   值域：星期 × 节次 × 教室（× 单双周）
  └─────────────┘   约束：教师 / 班级 / 教室互斥 + 规则值 FORBIDDEN
        │
        ▼
  ┌─────────────┐   回溯 + 前向检查 + MRV 变量序 + LCV 学科分散
  │  CspSolver  │   降级求解: 贪心 + min-conflicts + 交换修复 + 分布优化
  └─────────────┘
        │
        ▼
  ┌─────────────┐   选择 / 交叉 / 变异 + 局部搜索精修 + 种子保底回退
  │ GaOptimizer │   适应度 = B类×0.5 + C类×1.0（含分散度/周内天间隔）
  └─────────────┘
        │
        ▼
  ┌─────────────┐   时段偏好、学科分散度、教师集中度(方差)、连堂合规
  │  Scorer     │   B类(100基准) + C类(分散度+周内天间隔) 加权归一
  └─────────────┘
        │
        ▼
   课表快照 → 冲突检测 → 人工微调 → 版本发布
```

- 排课任务通过 RabbitMQ 异步执行，Redisson 分布式锁保证同一学期不并发排课
- 每次生成写入版本快照，可对比差异并回滚
- 硬约束保证「零冲突」；软约束以评分呈现，允许管理员权衡后人工覆盖

---

## 开源协议

**AGPL-3.0**。分发或修改后必须以相同协议开源；通过网络提供服务（SaaS）时必须向使用者提供完整源码。
