# 下阶段（M5 · 引擎 v2 质量优化）会话启动提示词

> 复制下面「提示词正文」整段，粘到**新会话**的第一条消息即可。
> 不要在提示词里写死分支名——Arena 每个新会话会自动分配一条新分支（是本会话分支的延续）。

---

## 提示词正文（复制这一整段）

```
这是一个跨会话的课表排课项目（智课排 / CourseSchedulingSystem）。请先按顺序做完准备工作，再动手写代码：

1. 读 PROGRESS.md —— 里程碑表 M3/M4 行、变更日志 #18/#19、已锁定决策 D1~D9、工作区纪律
2. 读 docs/08-会话交接指南.md —— 会话流程与 §8 故障排查表
3. 读 docs/04-排课算法设计.md 第 3 章（软约束与评分）、第 4 章（优化算子：ALNS / LAHC / Kempe / Polish）
4. 读 docs/06-开发计划.md 的 M5 章节（验收指标在节末）
5. git log --oneline -15

然后用不超过 10 行复述计划，等我确认后再写代码。

本次目标：M5 · 引擎 v2（质量优化）——在「硬约束 0」不被破坏的前提下把课表质量做到指标达标：
- 评分器：13 条软约束全量实现 + 三档权重（库里已有 teacher_first / balanced / student_first 的 S1~S15）
- 增量评分缓存（classDay / teacherDay / subjectDay）
- Move 接口 + 算子：swap / move / blockMove / kempe / ruinRecreate / hungarian
- ALNS（破坏+修复+自适应权重）、LAHC 精修、Polish 抛光六条
- 时间预算分配与可中断（30s 预算内；执行页阶段清单要插入质量优化两步）
- 回归指标断言：教师日课时 ≤6、空隙课 ≤0.3×教师数、同科同日重复 ≤5%、
  主课上午 ≥70%、连堂完整率 100%

开工第一件事：跑 npm run bench 建立 M5 基线——d91f4f0（事实连堂）之后没有正式 bench 记录
（冒烟参考：120 班 starts=4 约 1.8s / solved / 3900 课 / 硬约束 0 / 事实连堂 0）。
此后每改 src/solver/** 都必须重跑 bench + npm run test:sqlite（当前 150/150）。

已经就绪、不要重做：
- 引擎全套 src/solver/**（建模 / 位图+并发计数占用 / AC-3 / 霍尔诊断 / DSATUR / min-conflicts /
  H1~H11 独立校验器 / 事实连堂强偏好 adjacency）
- Worker 编排与事务落库（src/main/solver/{protocol,solverWorker}.ts、solverRunService.ts、
  scheduleResultService.ts）；进度事件通路（Electron sender / 预览 400ms 轮询）
- 排课执行页（SchedulingPage + DiagnosisCard）与课表页四视图（M4 完成，已验收）
- 课表页右侧「质量指标 / 换课建议」卡是 M5/M6 占位，评分器出来后接入

约束：只在本会话分配到的 arena/* 分支工作，不切换不新建；每个逻辑单元 commit + push；
不推翻 D1~D9（D9：拼合组=同槽+各班各占一间场地+人数按单班核；排课尽量不连堂，
连堂只认显式配置的任务）；src/solver/** 禁止 import Electron/Node（worker 入口除外）；
DB 变更一律新增 migration（007_ 起）带 verify 结构断言；文档空白或矛盾先问我。
```

---

## 开工速查（详细版见 PROGRESS.md 第七节「开工前务必知道的 5 条」）

- **沙箱轮次重置**：开工先 `git log --oneline -1` + `ls node_modules | wc -l`；若被重置：
  `git fetch origin <当前分支> && git reset --mixed FETCH_HEAD`（**绝不 reset --hard**）→
  `npm install --ignore-scripts` → 铺数据（ZHIKEPAI_DB + node-sqlite-driver + seed-m2-demo.cjs）→ `npm run preview:ui`
- **测试**：`npm run test:sqlite`（150/150）；改 `src/solver/**` 后必跑 `npm run bench`
- **M5 验收指标**：教师日课时 ≤6、空隙课 ≤0.3×教师数、同科同日重复 ≤5%、主课上午 ≥70%、连堂完整率 100%
- **上一轮遗留**：bench 基线待补（d91f4f0 之后未正式跑过）
