/**
 * 诊断条目的统一结构。
 *
 * 输出风格（docs/04 §3.3）：**平实、可执行，不炫技**。
 * 每条都要回答三件事：哪里不够、差多少、怎么办。
 * 这是评委录错数据时唯一能自救的东西，措辞比算法更重要。
 */
export type DiagnosisLevel = 'error' | 'warn'

export interface Diagnosis {
  level: DiagnosisLevel
  /** 稳定的机器码，UI 用它分组与埋点 */
  code: string
  /** 一句话说清哪里出问题，带上主体名称 */
  title: string
  /** 供给 / 需求 / 缺口的明细 */
  detail: string
  /** 可执行的处置建议，按推荐程度排序 */
  suggestions: string[]
  ref?: { kind: 'class' | 'teacher' | 'subject' | 'room' | 'slot' | 'task' | 'unit'; id: number }
}
