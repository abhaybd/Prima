import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../types/config'
import { combineChannels, maybeDecoy, policyRatio, shouldSkipEval } from './freeze'

describe('freeze criterion', () => {
  it('skips opening plies, single replies, and terminals', () => {
    expect(
      shouldSkipEval({
        ply: 4,
        legalMoveCount: 20,
        afterMoveTerminal: false,
        openingSkipPlies: 12,
        wdlClauseEnabled: false,
      }),
    ).toBe(true)
    expect(
      shouldSkipEval({
        ply: 20,
        legalMoveCount: 1,
        afterMoveTerminal: false,
        openingSkipPlies: 12,
        wdlClauseEnabled: false,
      }),
    ).toBe(true)
    expect(
      shouldSkipEval({
        ply: 20,
        legalMoveCount: 20,
        afterMoveTerminal: true,
        openingSkipPlies: 12,
        wdlClauseEnabled: false,
      }),
    ).toBe(true)
  })

  it('skips extreme WDL only when Channel B ran', () => {
    expect(
      shouldSkipEval({
        ply: 20,
        legalMoveCount: 20,
        afterMoveTerminal: false,
        openingSkipPlies: 12,
        wdlClauseEnabled: true,
        preMoveExpected: 0.99,
      }),
    ).toBe(true)
    expect(
      shouldSkipEval({
        ply: 20,
        legalMoveCount: 20,
        afterMoveTerminal: false,
        openingSkipPlies: 12,
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
})
