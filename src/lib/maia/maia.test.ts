import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { legalUcis } from '../chess'
import { chooseOpponentMove, decodePolicy, nucleusPolicy, OPPONENT_TOP_P, sampleMove } from './decode'
import { mirrorMove, MOVE_INDEX, MOVE_VOCAB } from './moves'
import { tokenizeBoard } from './tokenize'

/** CSSLab/maia-platform-frontend `boardToMaia3Tokens` after optional `mirrorFEN`. */
function tokenizeLikePlatform(fen: string): Float32Array {
  const turn = fen.split(' ')[1]
  const boardFen = turn === 'b' ? mirrorFenPlatform(fen) : fen
  const pieceTypes = ['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']
  const tensor = new Float32Array(64 * 12)
  const rows = boardFen.split(' ')[0].split('/')
  for (let rank = 0; rank < 8; rank++) {
    const row = 7 - rank
    let file = 0
    for (const char of rows[rank]) {
      if (char >= '1' && char <= '8') {
        file += Number(char)
      } else {
        const pieceIdx = pieceTypes.indexOf(char)
        tensor[(row * 8 + file) * 12 + pieceIdx] = 1
        file += 1
      }
    }
  }
  return tensor
}

function mirrorFenPlatform(fen: string): string {
  const [position, activeColor, castling, enPassant, halfmove, fullmove] = fen.split(' ')
  const ranks = position.split('/').slice().reverse().map((rank) =>
    rank.replace(/[A-Za-z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())),
  )
  const mirroredEp = enPassant !== '-' ? enPassant[0] + String(9 - Number(enPassant[1])) : '-'
  return `${ranks.join('/')} ${activeColor === 'w' ? 'b' : 'w'} ${castling} ${mirroredEp} ${halfmove} ${fullmove}`
}

describe('Maia vocab', () => {
  it('has 4352 moves with promotions last', () => {
    expect(MOVE_VOCAB).toHaveLength(4352)
    expect(MOVE_VOCAB[0]).toBe('a1a1')
    expect(MOVE_VOCAB[4096]).toBe('a7a8q')
    expect(MOVE_VOCAB[4351]).toBe('h7h8n')
    expect(MOVE_INDEX.e2e4).toBe(12 * 64 + 28)
  })

  it('mirrors ranks for Black-to-move UCIs', () => {
    expect(mirrorMove('e7e5')).toBe('e2e4')
    expect(mirrorMove('e7e8q')).toBe('e2e1q')
  })

  it('matches CSSLab get_all_possible_moves indices', () => {
    expect(MOVE_INDEX.e2e4).toBe(796)
    expect(MOVE_INDEX.e1g1).toBe(262)
    expect(MOVE_INDEX.a7a8q).toBe(4096)
    expect(MOVE_INDEX.a7a8n).toBe(4099)
    expect(MOVE_INDEX.h7h8n).toBe(4351)
  })
})

describe('tokenizeBoard', () => {
  it('one-hots startpos pieces without flipping', () => {
    const tokens = tokenizeBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    expect(tokens).toHaveLength(64 * 12)
    expect(tokens[8 * 12 + 0]).toBe(1)
    expect(tokens[48 * 12 + 6]).toBe(1)
    expect(tokens.reduce((a, b) => a + b, 0)).toBe(32)
  })

  it('flips and swaps colors when Black is to move', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
    const tokens = tokenizeBoard(fen)
    expect(tokens[36 * 12 + 6]).toBe(1)
  })

  it('matches the Maia platform FEN-mirror tokenizer', () => {
    const fens = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1',
      '4k3/8/8/8/8/8/p7/4K3 b - - 0 1',
      '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
    ]
    for (const fen of fens) {
      expect(tokenizeBoard(fen)).toEqual(tokenizeLikePlatform(fen))
    }
  })
})

describe('decodePolicy', () => {
  it('renormalizes over legal moves including a promotion', () => {
    const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1'
    const logits = new Float32Array(4352)
    logits[MOVE_INDEX.a7a8q] = 5
    logits[MOVE_INDEX.a7a8n] = 1
    const policy = decodePolicy(fen, logits)
    const queen = policy.find((m) => m.uci === 'a7a8q')
    const knight = policy.find((m) => m.uci === 'a7a8n')
    expect(queen).toBeTruthy()
    expect(knight).toBeTruthy()
    expect(queen!.p).toBeGreaterThan(knight!.p)
    expect(policy.reduce((s, m) => s + m.p, 0)).toBeCloseTo(1)
  })

  it('maps Black-to-move legal moves through the mirror', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
    const logits = new Float32Array(4352)
    logits[MOVE_INDEX[mirrorMove('e7e5')]] = 8
    const policy = decodePolicy(fen, logits)
    const top = policy.reduce((a, b) => (a.p > b.p ? a : b))
    expect(top.uci).toBe('e7e5')
  })

  it('keeps every legal move after mirroring, including castle, EP, and Black promotions', () => {
    const fens = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
      'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1',
      '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
      '4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1',
      '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
      '4k3/8/8/8/8/8/p7/4K3 b - - 0 1',
    ]
    const logits = new Float32Array(4352)
    for (const fen of fens) {
      const legal = legalUcis(new Chess(fen))
      const policy = decodePolicy(fen, logits)
      expect(policy.map((m) => m.uci).sort()).toEqual([...legal].sort())
    }
  })
})

describe('sampleMove', () => {
  const policy = [
    { uci: 'f1c4', p: 0.5, logit: 3 },
    { uci: 'f1b5', p: 0.3, logit: 2 },
    { uci: 'd2d4', p: 0.12, logit: 1 },
    { uci: 'f3e5', p: 0.08, logit: 0 },
  ]

  it('follows the inverse CDF when the full distribution is kept', () => {
    expect(sampleMove(policy, () => 0.0, 1)).toBe('f1c4')
    expect(sampleMove(policy, () => 0.499, 1)).toBe('f1c4')
    expect(sampleMove(policy, () => 0.5001, 1)).toBe('f1b5')
    expect(sampleMove(policy, () => 0.999, 1)).toBe('f3e5')
  })

  it('drops the long tail the way CSSLab UCI nucleus sampling does', () => {
    // cum: 0.50, 0.80, 0.92, 1.00 — with top-p 0.9 keep only the first two, then renormalize
    const kept = nucleusPolicy(policy, OPPONENT_TOP_P)
    expect(kept.map((m) => m.uci)).toEqual(['f1c4', 'f1b5'])
    expect(kept[0].p).toBeCloseTo(0.625)
    expect(kept[1].p).toBeCloseTo(0.375)
    expect(sampleMove(policy, () => 0.999)).toBe('f1b5')
    expect(sampleMove(policy, () => 0.0)).toBe('f1c4')
  })

  it('argmax always picks the top move', () => {
    expect(chooseOpponentMove(policy, 'argmax')).toBe('f1c4')
    expect(chooseOpponentMove(policy, 'nucleus', 0.9, () => 0.999)).toBe('f1b5')
  })
})
