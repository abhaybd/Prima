export type ClockBucket = '>120s' | '120–60s' | '60–30s' | '30–15s' | '15–5s' | '<5s'

export const CLOCK_BUCKETS: ClockBucket[] = [
  '>120s',
  '120–60s',
  '60–30s',
  '30–15s',
  '15–5s',
  '<5s',
]

export function clockBucket(ms: number): ClockBucket {
  const s = ms / 1000
  if (s > 120) return '>120s'
  if (s > 60) return '120–60s'
  if (s > 30) return '60–30s'
  if (s > 15) return '30–15s'
  if (s > 5) return '15–5s'
  return '<5s'
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Two-sided 95% Student-t critical value by degrees of freedom. */
const T_CRIT_95 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16,
  2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052,
  2.048, 2.045, 2.042,
]

export function tCritical95(df: number): number {
  if (df < 1) return Infinity
  if (df <= 30) return T_CRIT_95[df - 1]
  if (df <= 40) return 2.021
  if (df <= 60) return 2.0
  if (df <= 120) return 1.98
  return 1.96
}

export interface MeanCi95 {
  mean: number
  low: number | null
  high: number | null
  n: number
}

/** Mean with a two-sided 95% t-interval. No interval until n ≥ 2. */
export function meanCi95(values: number[]): MeanCi95 | null {
  const m = mean(values)
  if (m === null) return null
  const n = values.length
  if (n < 2) return { mean: m, low: null, high: null, n }
  const variance = values.reduce((acc, x) => acc + (x - m) ** 2, 0) / (n - 1)
  const sem = Math.sqrt(variance / n)
  if (!Number.isFinite(sem) || sem < 1e-12) return { mean: m, low: m, high: m, n }
  const half = tCritical95(n - 1) * sem
  return { mean: m, low: m - half, high: m + half, n }
}

/** Channel A ratio P(played)/P(expert top), shown as a percent. */
export function formatOptimality(ratio: number | null, digits = 0): string {
  if (ratio === null) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}
