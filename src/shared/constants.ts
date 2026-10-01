/**
 * 跨主/预加载/渲染/引擎共享的常量。
 * 注意：本文件及 shared/** 目录禁止 import Electron 或 Node 内置模块，
 * 以便未来被 src/solver/** 直接复用（引擎要求纯 TS、零 IO）。
 */

export const APP_NAME = '智课排' as const

/** 每周上课天数（周一~周五），如需支持六天制在 M1 学段设置中可覆盖 */
export const DEFAULT_SCHOOL_DAYS = 5

export function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}
