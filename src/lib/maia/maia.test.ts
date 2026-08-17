import { describe, expect, it } from 'vitest'
import { decodePolicy } from './decode'
import { mirrorMove, MOVE_INDEX, MOVE_VOCAB } from './moves'
import { tokenizeBoard } from './tokenize'

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
})
