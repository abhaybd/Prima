import { describe, expect, it } from 'vitest'
import {
  expectedScore,
  parseBestMove,
  parseWdl,
  userPovExpected,
  wdlDelta,
} from './wdl'

describe('WDL math', () => {
  it('converts permille WDL to expected score', () => {
    expect(expectedScore({ w: 1000, d: 0, l: 0 })).toBe(1)
    expect(expectedScore({ w: 0, d: 1000, l: 0 })).toBe(0.5)
    expect(expectedScore({ w: 0, d: 0, l: 1000 })).toBe(0)
    expect(expectedScore({ w: 200, d: 600, l: 200 })).toBe(0.5)
  })

  it('negates STM scores when the user is not to move', () => {
    expect(userPovExpected(0.8, true)).toBe(0.8)
    expect(userPovExpected(0.8, false)).toBeCloseTo(0.2)
  })

  it('reports a positive wdlDelta after a blunder from White', () => {
    const bestUser = userPovExpected(0.92, true)
    const afterUser = userPovExpected(0.81, false)
    expect(wdlDelta(bestUser, afterUser)).toBeCloseTo(0.92 - 0.19)
    expect(wdlDelta(bestUser, afterUser)).toBeGreaterThan(0)
  })

  it('reports a positive wdlDelta after a blunder from Black', () => {
    const bestUser = userPovExpected(0.85, true)
    const afterUser = userPovExpected(0.6, false)
    const delta = wdlDelta(bestUser, afterUser)
    expect(delta).toBeCloseTo(0.85 - 0.4)
    expect(delta).toBeGreaterThan(0)
  })

  it('parses UCI info and bestmove lines', () => {
    const line =
      'info depth 5 seldepth 2 multipv 1 score cp 58 wdl 140 859 1 nodes 174'
    expect(parseWdl(line)).toEqual({ w: 140, d: 859, l: 1 })
    expect(parseBestMove('bestmove d2d4 ponder a7a6')).toBe('d2d4')
  })
})
