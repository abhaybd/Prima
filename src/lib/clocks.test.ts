import { describe, expect, it } from 'vitest'
import { freezeClockRunsDuringFreeze } from './clocks'

describe('freeze clock modes', () => {
  it('runs throughout a freeze only in running mode', () => {
    expect(freezeClockRunsDuringFreeze('running', 1000, null)).toBe(true)
    expect(freezeClockRunsDuringFreeze('paused', 1000, null)).toBe(false)
    expect(freezeClockRunsDuringFreeze('penalty', 1000, null)).toBe(false)
  })

  it('resumes after the grace window, and not before', () => {
    expect(freezeClockRunsDuringFreeze('grace', 2999, 3000)).toBe(false)
    expect(freezeClockRunsDuringFreeze('grace', 3000, 3000)).toBe(true)
    expect(freezeClockRunsDuringFreeze('grace', 4000, 3000)).toBe(true)
    expect(freezeClockRunsDuringFreeze('grace', 4000, null)).toBe(false)
  })
})
