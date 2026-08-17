import { Chess, type Square } from 'chess.js'

const CHANNEL: Record<string, number> = {
  p: 0,
  n: 1,
  b: 2,
  r: 3,
  q: 4,
  k: 5,
}

function squareName(index: number): Square {
  const file = index % 8
  const rank = Math.floor(index / 8)
  return `${String.fromCharCode(97 + file)}${rank + 1}` as Square
}

/**
 * Maia-3 board tokens: 64 squares × 12 piece-only one-hot channels.
 * When Black is to move the board is vertically flipped and colors are swapped
 * so the side to move is always White in model space (CSSLab/maia3 tokenize_board).
 */
export function tokenizeBoard(fen: string): Float32Array {
  const chess = new Chess(fen)
  const blackToMove = chess.turn() === 'b'
  const tokens = new Float32Array(64 * 12)

  for (let sq = 0; sq < 64; sq++) {
    const piece = chess.get(squareName(sq))
    if (!piece) continue
    let dest = sq
    let color = piece.color
    if (blackToMove) {
      dest = sq ^ 56
      color = color === 'w' ? 'b' : 'w'
    }
    const channel = CHANNEL[piece.type] + (color === 'b' ? 6 : 0)
    tokens[dest * 12 + channel] = 1
  }
  return tokens
}
