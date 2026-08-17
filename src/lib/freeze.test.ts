import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../types/config'
import { commitAttempts, freezeVerdict, maybeDecoy, policyRatio, plyHadRealFreeze, ratioForAttempt, recordedTrigger, shouldSkipEval, skipEvalReason } from './freeze'

const base = {
  legalMoveCount: 20,
  afterMoveTerminal: false,
  inOpeningBook: false,
}

describe('freeze criterion', () => {
  it('names skip reasons', () => {
    expect(skipEvalReason({ ...base, inOpeningBook: true })).toBe('opening')
    expect(skipEvalReason({ ...base, legalMoveCount: 1 })).toBe('forced')
    expect(skipEvalReason({ ...base, afterMoveTerminal: true })).toBe('terminal')
  })

  it('skips in-book positions, single replies, and terminals', () => {
    expect(shouldSkipEval({ ...base, inOpeningBook: true })).toBe(true)
    expect(shouldSkipEval({ ...base, legalMoveCount: 1 })).toBe(true)
    expect(shouldSkipEval({ ...base, afterMoveTerminal: true })).toBe(true)
    expect(shouldSkipEval(base)).toBe(false)
  })

  it('does not skip out-of-book opening moves', () => {
    expect(shouldSkipEval({ ...base, inOpeningBook: false })).toBe(false)
  })

  it('uses a ratio, not a raw probability', () => {
    expect(policyRatio(0.02, 0.2)).toBeCloseTo(0.1)
    expect(policyRatio(0.2, 0.2)).toBeCloseTo(1)
  })

  it('freezes only when optimality is below min optimality', () => {
    const tau = DEFAULT_CONFIG.tauRatio
    expect(freezeVerdict(0.1, tau)).toEqual({ freeze: true, trigger: 'ratio' })
    expect(freezeVerdict(0.5, tau)).toEqual({ freeze: false, trigger: 'none' })
    expect(freezeVerdict(tau, tau)).toEqual({ freeze: false, trigger: 'none' })
  })

  it('rolls decoys only on passing moves', () => {
    expect(maybeDecoy(false, 1)).toBe(false)
    expect(maybeDecoy(true, 1, () => 0)).toBe(true)
    expect(maybeDecoy(true, 0, () => 0)).toBe(false)
  })

  it('treats a later pass as a freeze ply if any attempt froze', () => {
    expect(plyHadRealFreeze({ trigger: 'none', retries: 0 })).toBe(false)
    expect(plyHadRealFreeze({ trigger: 'ratio', retries: 0 })).toBe(true)
    expect(plyHadRealFreeze({ trigger: 'wdl', retries: 0 })).toBe(true)
    expect(plyHadRealFreeze({ trigger: 'both', retries: 0 })).toBe(true)
    expect(plyHadRealFreeze({ trigger: 'none', retries: 2 })).toBe(true)
    expect(plyHadRealFreeze({ trigger: 'decoy', retries: 1 })).toBe(false)
    expect(plyHadRealFreeze({ trigger: 'none', retries: 2, hadRealFreeze: true })).toBe(true)
    expect(plyHadRealFreeze({ trigger: 'none', retries: 2, hadRealFreeze: false })).toBe(false)
  })

  it('keeps a decoy trigger when a later different move passes', () => {
    expect(recordedTrigger('none', false, false)).toBe('none')
    expect(recordedTrigger('decoy', true, false)).toBe('decoy')
    expect(recordedTrigger('none', true, false)).toBe('decoy')
    expect(recordedTrigger('none', true, true)).toBe('none')
    expect(recordedTrigger('ratio', true, true)).toBe('ratio')
  })

  it('commits per-attempt optimality, using 1 for an auto-revealed expert move', () => {
    expect(commitAttempts(['e2e4'], [0.2], 'e2e4', 0.2, 'accepted')).toEqual({
      attempts: ['e2e4'],
      attemptRatios: [0.2],
    })
    expect(commitAttempts(['e2e4', 'd2d4'], [0.1, 0.4], 'g1f3', 0.4, 'revealed')).toEqual({
      attempts: ['e2e4', 'd2d4', 'g1f3'],
      attemptRatios: [0.1, 0.4, 1],
    })
    expect(commitAttempts(['e2e4'], [], 'e2e4', 0.8, 'accepted')).toEqual({
      attempts: ['e2e4'],
      attemptRatios: [0.8],
    })
    expect(commitAttempts(['e2e4', 'd2d4'], [0.9, 0.7], 'd2d4', 0.7, 'accepted')).toEqual({
      attempts: ['e2e4', 'd2d4'],
      attemptRatios: [0.9, 0.7],
    })
  })

  it('reads per-attempt optimality, falling back for single-try legacy records', () => {
    expect(ratioForAttempt({ attempts: ['e2e4'], ratio: 0.5, evaluated: false }, 0)).toBeNull()
    expect(ratioForAttempt({ attempts: ['e2e4'], ratio: 0.5, evaluated: true }, 0)).toBe(0.5)
    expect(
      ratioForAttempt({ attempts: ['e2e4', 'd2d4'], ratio: 0.9, evaluated: true }, 0),
    ).toBeNull()
    expect(
      ratioForAttempt(
        { attempts: ['e2e4', 'd2d4'], attemptRatios: [0.1, 0.9], ratio: 0.9, evaluated: true },
        0,
      ),
    ).toBe(0.1)
  })
})
