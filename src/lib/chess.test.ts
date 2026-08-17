import { describe, expect, it } from 'vitest'
import { isForcingMove, phaseOf } from './chess'
import { clockBucket } from './metrics'

describe('phase and forcing flags', () => {
  it('labels early plies as opening', () => {
    expect(phaseOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 0)).toBe(
      'opening',
    )
  })

  it('labels sparse material as endgame after ply 24', () => {
    expect(phaseOf('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1', 40)).toBe('endgame')
  })

  it('marks captures as forcing', () => {
    expect(
      isForcingMove('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e4d5'),
    ).toBe(true)
  })
})

describe('clock buckets', () => {
  it('uses the dashboard edges', () => {
    expect(clockBucket(121_000)).toBe('>120s')
    expect(clockBucket(90_000)).toBe('120–60s')
    expect(clockBucket(4_000)).toBe('<5s')
  })
})
