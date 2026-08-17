import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../types/config'
import { combineChannels, maybeDecoy, policyRatio, plyHadRealFreeze, shouldSkipEval, skipEvalReason } from './freeze'

const base = {
  legalMoveCount: 20,
  afterMoveTerminal: false,
  inOpeningBook: false,
  wdlClauseEnabled: false,
}

describe('freeze criterion', () => {
  it('names skip reasons', () => {
    expect(skipEvalReason({ ...base, inOpeningBook: true })).toBe('opening')
    expect(skipEvalReason({ ...base, legalMoveCount: 1 })).toBe('forced')
    expect(skipEvalReason({ ...base, afterMoveTerminal: true })).toBe('terminal')
    expect(
      skipEvalReason({
        ...base,
        wdlClauseEnabled: true,
        preMoveExpected: 0.99,
      }),
    ).toBe('extreme-wdl')
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

  it('skips extreme WDL only when Channel B ran', () => {
    expect(
      shouldSkipEval({
        ...base,
        wdlClauseEnabled: true,
        preMoveExpected: 0.99,
      }),
    ).toBe(true)
    expect(
      shouldSkipEval({
        ...base,
        wdlClauseEnabled: false,
        preMoveExpected: 0.99,
      }),
    ).toBe(false)
  })

  it('uses a ratio, not a raw probability', () => {
    expect(policyRatio(0.02, 0.2)).toBeCloseTo(0.1)
    expect(policyRatio(0.2, 0.2)).toBeCloseTo(1)
  })

  it('combines channels and attributes the trigger', () => {
    const cfg = { ...DEFAULT_CONFIG, tauRatio: 0.15, tauWdl: 0.12, wdlClauseEnabled: true }
    expect(combineChannels(0.1, 0.05, cfg)).toEqual({ freeze: true, trigger: 'ratio' })
    expect(combineChannels(0.5, 0.2, cfg)).toEqual({ freeze: true, trigger: 'wdl' })
    expect(combineChannels(0.1, 0.2, cfg)).toEqual({ freeze: true, trigger: 'both' })
    expect(combineChannels(0.5, 0.05, cfg)).toEqual({ freeze: false, trigger: 'none' })
    expect(combineChannels(0.5, 0.2, { ...cfg, wdlClauseEnabled: false })).toEqual({
      freeze: false,
      trigger: 'none',
    })
  })

  it('rolls decoys only on passing moves', () => {
    expect(maybeDecoy(false, 1)).toBe(false)
    expect(maybeDecoy(true, 1, () => 0)).toBe(true)
    expect(maybeDecoy(true, 0, () => 0)).toBe(false)
  })

  it('treats a later pass as a freeze ply if any attempt froze', () => {
    expect(plyHadRealFreeze({ trigger: 'none', retries: 0 })).toBe(false)
    expect(plyHadRealFreeze({ trigger: 'ratio', retries: 0 })).toBe(true)
    expect(plyHadRealFreeze({ trigger: 'none', retries: 2 })).toBe(true)
    expect(plyHadRealFreeze({ trigger: 'decoy', retries: 1 })).toBe(false)
    expect(plyHadRealFreeze({ trigger: 'none', retries: 2, hadRealFreeze: true })).toBe(true)
    expect(plyHadRealFreeze({ trigger: 'none', retries: 2, hadRealFreeze: false })).toBe(false)
  })
})
