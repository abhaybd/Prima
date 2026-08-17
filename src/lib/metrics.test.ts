import { describe, expect, it } from 'vitest'
import { mean, meanCi95, tCritical95 } from './metrics'

describe('mean 95% CI', () => {
  it('uses Student t critical values, approaching 1.96', () => {
    expect(tCritical95(1)).toBeCloseTo(12.706, 3)
    expect(tCritical95(2)).toBeCloseTo(4.303, 3)
    expect(tCritical95(30)).toBeCloseTo(2.042, 3)
    expect(tCritical95(1000)).toBeCloseTo(1.96, 2)
  })

  it('is absent for empty or single-sample series', () => {
    expect(meanCi95([])).toBeNull()
    expect(meanCi95([0.5])).toEqual({ mean: 0.5, low: null, high: null, n: 1 })
  })

  it('matches the t interval for [1, 2, 3]', () => {
    const ci = meanCi95([1, 2, 3])
    expect(ci).not.toBeNull()
    expect(ci?.mean).toBe(2)
    expect(ci?.n).toBe(3)
    expect(ci?.low).toBeCloseTo(2 - 4.303 / Math.sqrt(3), 2)
    expect(ci?.high).toBeCloseTo(2 + 4.303 / Math.sqrt(3), 2)
  })

  it('collapses when every sample is the same', () => {
    const ci = meanCi95([0.8, 0.8, 0.8])
    expect(ci?.n).toBe(3)
    expect(ci?.mean).toBeCloseTo(0.8)
    expect(ci?.low).toBeCloseTo(0.8)
    expect(ci?.high).toBeCloseTo(0.8)
  })

  it('agrees with mean()', () => {
    const values = [0.2, 0.4, 0.9]
    expect(meanCi95(values)?.mean).toBe(mean(values))
  })
})
