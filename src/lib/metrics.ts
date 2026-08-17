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
