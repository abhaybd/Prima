import { describe, expect, it } from 'vitest'
import { applyUci, isForcingMove, newChess, phaseOf, restoreFen, uciToSan } from './chess'
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

describe('uciToSan', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

  it('converts quiet moves and captures', () => {
    expect(uciToSan(start, 'e2e4')).toBe('e4')
    expect(
      uciToSan('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e4d5'),
    ).toBe('exd5')
  })

  it('converts promotions from the side to move', () => {
    expect(uciToSan('8/P7/8/8/7k/8/8/4K3 w - - 0 1', 'a7a8q')).toBe('a8=Q')
  })

  it('returns the UCI string when the move is illegal', () => {
    expect(uciToSan(start, 'e2e5')).toBe('e2e5')
  })
})

describe('restoreFen', () => {
  it('undoes without dropping earlier SAN history', () => {
    const chess = newChess()
    applyUci(chess, 'e2e4')
    applyUci(chess, 'e7e5')
    const fenBefore = chess.fen()
    applyUci(chess, 'g1f3')
    restoreFen(chess, fenBefore)
    expect(chess.fen()).toBe(fenBefore)
    expect(chess.history()).toEqual(['e4', 'e5'])
  })
})

describe('clock buckets', () => {
  it('uses the dashboard edges', () => {
    expect(clockBucket(121_000)).toBe('>120s')
    expect(clockBucket(90_000)).toBe('120–60s')
    expect(clockBucket(4_000)).toBe('<5s')
  })
})
