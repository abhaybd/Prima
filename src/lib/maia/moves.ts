/** 4096 from-to UCIs plus 256 white-perspective promotions (q,r,b,n). */

const FILES = 'abcdefgh'
const PROMO_PIECES = ['q', 'r', 'b', 'n'] as const

export const MOVE_VOCAB_SIZE = 4352

function squareName(file: number, rank: number): string {
  return `${FILES[file]}${rank + 1}`
}

export function buildMoveVocab(): string[] {
  const moves: string[] = []
  for (let fromRank = 0; fromRank < 8; fromRank++) {
    for (let fromFile = 0; fromFile < 8; fromFile++) {
      const from = squareName(fromFile, fromRank)
      for (let toRank = 0; toRank < 8; toRank++) {
        for (let toFile = 0; toFile < 8; toFile++) {
          moves.push(from + squareName(toFile, toRank))
        }
      }
    }
  }
  for (const fileFrom of FILES) {
    for (const fileTo of FILES) {
      for (const piece of PROMO_PIECES) {
        moves.push(`${fileFrom}7${fileTo}8${piece}`)
      }
    }
  }
  return moves
}

export const MOVE_VOCAB = buildMoveVocab()

export const MOVE_INDEX: Record<string, number> = Object.fromEntries(
  MOVE_VOCAB.map((uci, i) => [uci, i]),
)

export function mirrorSquare(square: string): string {
  return square[0] + String(9 - Number(square[1]))
}

export function mirrorMove(uci: string): string {
  const promo = uci.length > 4 ? uci.slice(4) : ''
  return mirrorSquare(uci.slice(0, 2)) + mirrorSquare(uci.slice(2, 4)) + promo
}
