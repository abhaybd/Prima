import { describe, expect, it } from 'vitest'
import { debugHref, debugVerdict, plyLabel } from './debug'
import type { EvalComment } from './pgn'

function comment(partial: Partial<EvalComment> & Pick<EvalComment, 'trigger' | 'freeze'>): EvalComment {
  return { ply: 0, uci: 'e2e4', evaluated: true, ...partial }
}

describe('debugHref', () => {
  it('leaves paths unchanged when debug is off', () => {
    expect(debugHref('/dashboard', false)).toBe('/dashboard')
    expect(debugHref('/', false)).toBe('/')
  })

  it('keeps ?debug=true on in-app links when debug is on', () => {
    expect(debugHref('/dashboard', true)).toEqual({
      pathname: '/dashboard',
      search: '?debug=true',
    })
    expect(debugHref('/report/abc', true)).toEqual({
      pathname: '/report/abc',
      search: '?debug=true',
    })
  })
})

describe('debugVerdict', () => {
  it('labels skip, decoy, freeze, and pass', () => {
    expect(debugVerdict(comment({ trigger: 'none', freeze: false, skipReason: 'opening', evaluated: false }))).toBe(
      'skip',
    )
    expect(debugVerdict(comment({ trigger: 'decoy', freeze: true }))).toBe('decoy')
    expect(debugVerdict(comment({ trigger: 'ratio', freeze: true }))).toBe('freeze')
    expect(debugVerdict(comment({ trigger: 'none', freeze: false }))).toBe('pass')
  })
})

describe('plyLabel', () => {
  it('uses standard move numbers', () => {
    expect(plyLabel(0)).toBe('1.')
    expect(plyLabel(1)).toBe('1...')
    expect(plyLabel(2)).toBe('2.')
  })
})
