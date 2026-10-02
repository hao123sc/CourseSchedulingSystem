/**
 * 可复现的伪随机数发生器（mulberry32）。
 *
 * 引擎必须可复现：同一个 SolverInput + 同一个 seed 必须排出同一张课表，
 * 否则 bug 无法稳定重现，回归测试也失去意义。禁止在 `src/solver/**` 里用 Math.random()。
 */
export interface Rng {
  /** [0,1) */
  next(): number
  /** [0,n) 整数 */
  int(n: number): number
  pick<T>(arr: T[]): T
  shuffle<T>(arr: T[]): T[]
}

export function createRng(seed: number): Rng {
  let a = (seed >>> 0) || 0x9e3779b9
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number): number => (n <= 0 ? 0 : Math.floor(next() * n) % n)
  return {
    next,
    int,
    pick: <T>(arr: T[]): T => arr[int(arr.length)],
    shuffle: <T>(arr: T[]): T[] => {
      const out = [...arr]
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1)
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    }
  }
}
