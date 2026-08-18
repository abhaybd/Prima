import { describe, expect, it } from 'vitest'
import {
  clampEvalForChart,
  evalAtPly,
  evalFromCheckmate,
  evalFromInfoLines,
  formatEvalPawns,
  mate0WhitePovPawns,
  normalizeMate0Eval,
  parseUciScore,
  sideToMoveFromFen,
  stmScoreToPawns,
  timelineFromMoves,
  whitePovMate,
  whitePovPawns,
} from './sfEval'

describe('parseUciScore', () => {
  it('reads centipawns from a UCI info line', () => {
    const line =
      'info depth 12 seldepth 8 multipv 1 score cp 34 nodes 1200 nps 40000 time 80 pv e2e4'
    expect(parseUciScore(line)).toEqual({ kind: 'cp', cp: 34 })
  })

  it('reads negative centipawns and mate', () => {
    expect(parseUciScore('info depth 8 score cp -128 pv e7e5')).toEqual({ kind: 'cp', cp: -128 })
    expect(parseUciScore('info depth 5 score cp +58 pv d2d4')).toEqual({ kind: 'cp', cp: 58 })
    expect(parseUciScore('info depth 20 score mate 4 pv d8h4')).toEqual({ kind: 'mate', mate: 4 })
    expect(parseUciScore('info depth 6 score mate -3 pv a2a3')).toEqual({ kind: 'mate', mate: -3 })
  })

  it('prefers mate when both tokens could appear', () => {
    expect(parseUciScore('info score mate 2 pv h7h8q')).toEqual({ kind: 'mate', mate: 2 })
  })

  it('returns null when there is no score', () => {
    expect(parseUciScore('info depth 1 nodes 12')).toBeNull()
    expect(parseUciScore('bestmove e2e4 ponder e7e5')).toBeNull()
  })
})

describe('normalize to White-POV pawns', () => {
  it('divides centipawns by 100', () => {
    expect(stmScoreToPawns({ kind: 'cp', cp: 34 })).toBeCloseTo(0.34)
    expect(stmScoreToPawns({ kind: 'cp', cp: -250 })).toBeCloseTo(-2.5)
    expect(stmScoreToPawns({ kind: 'cp', cp: 0 })).toBe(0)
  })

  it('maps mate to a large pawn equivalent that shrinks with distance', () => {
    expect(stmScoreToPawns({ kind: 'mate', mate: 1 })).toBe(99)
    expect(stmScoreToPawns({ kind: 'mate', mate: 3 })).toBe(97)
    expect(stmScoreToPawns({ kind: 'mate', mate: -2 })).toBe(-98)
    expect(stmScoreToPawns({ kind: 'mate', mate: 0 })).toBe(-100)
  })

  it('flips STM scores when Black is to move', () => {
    expect(whitePovPawns(0.34, 'w')).toBeCloseTo(0.34)
    expect(whitePovPawns(0.34, 'b')).toBeCloseTo(-0.34)
    expect(whitePovMate(3, 'w')).toBe(3)
    expect(whitePovMate(3, 'b')).toBe(-3)
    expect(whitePovMate(-2, 'b')).toBe(2)
  })

  it('uses the last (deepest) score in a search dump', () => {
    const lines = [
      'info depth 1 score cp 12 pv e2e4',
      'info depth 8 score cp -40 pv e2e4 e7e5',
      'info depth 12 score cp 28 pv e2e4 e7e5',
      'bestmove e2e4',
    ]
    expect(evalFromInfoLines(lines, 'w')).toEqual({ pawns: 0.28 })
    expect(evalFromInfoLines(lines, 'b')).toEqual({ pawns: -0.28 })
  })

  it('converts a mate score to White POV', () => {
    const lines = ['info depth 10 score mate 3 pv d8h4', 'bestmove d8h4']
    expect(evalFromInfoLines(lines, 'b')).toEqual({ pawns: -97, mate: -3 })
  })

  it('treats mate 0 as the side to move already mated', () => {
    const lines = ['info depth 0 score mate 0', 'bestmove (none)']
    expect(evalFromInfoLines(lines, 'b')).toEqual({ pawns: 100, mate: 0 })
    expect(evalFromInfoLines(lines, 'w')).toEqual({ pawns: -100, mate: 0 })
  })

  it('reads side to move from FEN', () => {
    expect(sideToMoveFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('w')
    expect(
      sideToMoveFromFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'),
    ).toBe('b')
  })
})

describe('formatEvalPawns', () => {
  it('shows pawns with a sign, never centipawns', () => {
    expect(formatEvalPawns({ pawns: 0.34 })).toBe('+0.34')
    expect(formatEvalPawns({ pawns: -1.2 })).toBe('-1.20')
    expect(formatEvalPawns({ pawns: 0 })).toBe('0.00')
    expect(formatEvalPawns(null)).toBe('—')
  })

  it('shows mate as #n from White POV', () => {
    expect(formatEvalPawns({ pawns: 97, mate: 3 })).toBe('#3')
    expect(formatEvalPawns({ pawns: -98, mate: -2 })).toBe('-#2')
    expect(formatEvalPawns({ pawns: 100, mate: 0 })).toBe('#')
    expect(formatEvalPawns({ pawns: -100, mate: 0 })).toBe('-#')
  })
})

describe('eval lookup', () => {
  it('prefers the move field, then the timeline', () => {
    expect(evalAtPly(2, { sfEval: 0.4 }, [{ ply: 2, pawns: 0.1 }])).toEqual({ pawns: 0.4 })
    expect(evalAtPly(2, {}, [{ ply: 2, pawns: 0.1, mate: 1 }])).toEqual({
      pawns: 0.1,
      mate: 1,
    })
    expect(evalAtPly(2, {}, [{ ply: 1, pawns: 0.1 }])).toBeNull()
  })

  it('scores checkmate from the mated side, not Stockfish sign', () => {
    expect(evalFromCheckmate('b')).toEqual({ pawns: 100, mate: 0 })
    expect(evalFromCheckmate('w')).toEqual({ pawns: -100, mate: 0 })
    expect(mate0WhitePovPawns(6)).toBe(100)
    expect(mate0WhitePovPawns(7)).toBe(-100)
  })

  it('shows a White mate as # even if mate 0 was stored inverted', () => {
    expect(normalizeMate0Eval({ pawns: -100, mate: 0 }, 6)).toEqual({ pawns: 100, mate: 0 })
    expect(evalAtPly(6, { sfEval: -100, sfMate: 0 }, [])).toEqual({ pawns: 100, mate: 0 })
    expect(evalAtPly(7, { sfEval: 100, sfMate: 0 }, [])).toEqual({ pawns: -100, mate: 0 })
    expect(formatEvalPawns(evalAtPly(6, { sfEval: -100, sfMate: 0 }, []))).toBe('#')
    expect(clampEvalForChart(evalAtPly(6, { sfEval: -100, sfMate: 0 }, [])!.pawns)).toBe(8)
  })

  it('builds a timeline from stored user moves', () => {
    expect(
      timelineFromMoves([
        { ply: 2, sfEval: 0.2 },
        { ply: 0, sfEval: 0.4, sfMate: undefined },
        { ply: 4 },
      ]),
    ).toEqual([
      { ply: 0, pawns: 0.4 },
      { ply: 2, pawns: 0.2 },
    ])
  })

  it('clamps mate-sized evals so a chart stays readable', () => {
    expect(clampEvalForChart(97)).toBe(8)
    expect(clampEvalForChart(-3.2)).toBeCloseTo(-3.2)
  })
})
