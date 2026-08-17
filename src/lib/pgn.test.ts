import { describe, expect, it } from 'vitest'
import { formatEvalComment, pgnForDisplay, pgnWithEvalComments, pgnWithoutComments } from './pgn'

describe('formatEvalComment', () => {
  it('includes Maia likelihood, WDL, and delta without braces', () => {
    const text = formatEvalComment({
      ply: 14,
      uci: 'e2e4',
      evaluated: true,
      pMove: 0.0123,
      pTop: 0.41,
      ratio: 0.03,
      eBest: 0.612,
      eAfter: 0.201,
      wdlDelta: 0.411,
      wdlStm: { w: 140, d: 859, l: 1 },
      wdlAfterStm: { w: 50, d: 200, l: 750 },
      trigger: 'none',
      freeze: false,
      sfBestMove: 'd2d4',
      thresholdTopMove: 'd2d4',
      tauRatio: 0.15,
      tauWdl: 0.12,
      wdlClauseEnabled: true,
      resolved: 'accepted',
    })
    expect(text).toContain('ply=14')
    expect(text).toContain('uci=e2e4')
    expect(text).toContain('p=0.0123')
    expect(text).toContain('pTop=0.4100')
    expect(text).toContain('ratio=0.030')
    expect(text).toContain('eBest=0.612')
    expect(text).toContain('eAfter=0.201')
    expect(text).toContain('wdlD=0.411')
    expect(text).toContain('wdl=140/859/1')
    expect(text).toContain('wdlAfter=50/200/750')
    expect(text).toContain('trig=none')
    expect(text).toContain('freeze=no')
    expect(text).toContain('sf=d2d4')
    expect(text).toContain('maia=d2d4')
    expect(text).not.toMatch(/[{}]/)
  })

  it('labels skipped opening-book moves', () => {
    const text = formatEvalComment({
      ply: 2,
      uci: 'g1f3',
      evaluated: false,
      skipReason: 'opening',
      trigger: 'none',
      freeze: false,
    })
    expect(text).toContain('skip=opening')
    expect(text).toContain('eval=no')
  })
})

describe('pgnWithEvalComments', () => {
  it('attaches comments to the matching ply', () => {
    const comments = new Map([
      [0, 'p=0.5000 ratio=1.000 trig=none freeze=no'],
      [2, 'skip=opening eval=no trig=none freeze=no'],
    ])
    const pgn = pgnWithEvalComments(['e4', 'e5', 'Nf3'], comments, { Result: '*' })
    expect(pgn).toContain('[Result "*"]')
    expect(pgn).toMatch(/1\.\s*e4 \{p=0\.5000 ratio=1\.000 trig=none freeze=no\}/)
    expect(pgn).toMatch(/e5(?!\s*\{)/)
    expect(pgn).toMatch(/Nf3 \{skip=opening eval=no trig=none freeze=no\}/)
  })
})

describe('pgnWithoutComments', () => {
  it('strips eval comments while keeping moves and headers', () => {
    const comments = new Map([
      [0, 'p=0.5000 ratio=1.000 trig=none freeze=no'],
      [2, 'skip=opening eval=no trig=none freeze=no'],
    ])
    const pgn = pgnWithEvalComments(['e4', 'e5', 'Nf3'], comments, { Result: '*' })
    const clean = pgnWithoutComments(pgn)
    expect(clean).toContain('[Result "*"]')
    expect(clean).toMatch(/1\.\s*e4/)
    expect(clean).toContain('e5')
    expect(clean).toContain('Nf3')
    expect(clean).not.toMatch(/\{/)
    expect(clean).not.toContain('trig=none')
  })
})

describe('pgnForDisplay', () => {
  it('keeps comments in debug mode and strips them otherwise', () => {
    const comments = new Map([[0, 'trig=ratio freeze=yes']])
    const pgn = pgnWithEvalComments(['e4'], comments, { Result: '*' })
    expect(pgnForDisplay(pgn, true)).toBe(pgn)
    expect(pgnForDisplay(pgn, false)).not.toContain('trig=ratio')
    expect(pgnForDisplay(pgn, false)).toMatch(/1\.\s*e4/)
  })
})
