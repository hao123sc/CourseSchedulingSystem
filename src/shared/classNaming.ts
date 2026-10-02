/**
 * 班级批量命名（纯函数，供主进程 batchCreate 与渲染层预览共用）。
 * 占位符：
 *   {n}     序号（如 1, 2, 3 ...）
 *   {name}  年级名（如 "初一"）
 *   {nn}    两位补零序号（01, 02 ...）
 */
export function formatClassName(pattern: string, index: number, gradeName: string): string {
  return pattern
    .replace(/\{nn\}/g, String(index).padStart(2, '0'))
    .replace(/\{n\}/g, String(index))
    .replace(/\{name\}/g, gradeName)
}

export function buildBatchNames(
  pattern: string,
  count: number,
  gradeName: string,
  startIndex = 1
): string[] {
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    names.push(formatClassName(pattern, startIndex + i, gradeName))
  }
  return names
}

/** 简称默认取序号 + "班"，如 "1班" */
export function defaultShortName(index: number): string {
  return `${index}班`
}
