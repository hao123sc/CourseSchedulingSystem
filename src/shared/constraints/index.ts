/**
 * `src/shared/constraints` —— 冲突判定纯逻辑的**唯一一份实现**。
 *
 * 被谁用：
 *  - 渲染进程：规则页预览、预排锁定录入校验、M6 拖拽落点着色
 *  - 引擎 `src/solver/**`：H1/H2/H3/H5/H7 的判定
 *
 * 纪律：本目录禁止 import Electron / Node 模块，也不得访问 DB —— 只做纯计算。
 */
export * from './ruleValue'
export * from './fixedLesson'
