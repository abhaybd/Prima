import { Chess, type Square } from 'chess.js'
import type { Color } from '../types/config'
import type { GamePhase, GameResult } from '../types/game'

export function newChess(fen?: string): Chess {
  return fen ? new Chess(fen) : new Chess()
}

export function toUci(from: string, to: string, promotion?: string): string {
  return promotion ? `${from}${to}${promotion}` : `${from}${to}`
}

export function parseUci(uci: string): { from: Square; to: Square; promotion?: string } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length > 4 ? uci[4] : undefined,
  }
}

export function applyUci(chess: Chess, uci: string): boolean {
  try {
    chess.move(parseUci(uci))
    return true
  } catch {
    return false
  }
}

/** Undo the last move. Prefer this over `load(fen)` — load clears SAN history. */
export function restoreFen(chess: Chess, fen: string): void {
  if (chess.fen() === fen) return
  if (chess.undo() && chess.fen() === fen) return
  chess.load(fen)
}

export function legalUcis(chess: Chess): string[] {
  return chess.moves({ verbose: true }).map((m) => {
    const promo = m.promotion ?? ''
    return `${m.from}${m.to}${promo}`
  })
}

export function isTerminal(chess: Chess): boolean {
  return chess.isGameOver()
}

export function resultFromBoard(chess: Chess, timedOut?: Color): GameResult {
  if (timedOut) return timedOut === 'w' ? '0-1' : '1-0'
  if (chess.isCheckmate()) return chess.turn() === 'w' ? '0-1' : '1-0'
  if (chess.isGameOver()) return '1/2-1/2'
  return '*'
}

export function isForcingMove(fen: string, uci: string): boolean {
  if (!uci) return false
  const chess = new Chess(fen)
  const parsed = parseUci(uci)
  const promo = Boolean(parsed.promotion)
  try {
    const move = chess.move(parsed)
    return Boolean(move.captured) || chess.isCheck() || promo
  } catch {
    return promo
  }
}

export function phaseOf(fen: string, ply: number): GamePhase {
  if (ply < 24) return 'opening'
  const chess = new Chess(fen)
  let minorsAndMajors = 0
  const board = chess.board()
  for (const rank of board) {
    for (const piece of rank) {
      if (!piece) continue
      if (piece.type !== 'p' && piece.type !== 'k') minorsAndMajors += 1
    }
  }
  if (minorsAndMajors <= 6) return 'endgame'
  return 'middlegame'
}

export function resolveUserColor(pref: 'w' | 'b' | 'random'): Color {
  if (pref === 'random') return Math.random() < 0.5 ? 'w' : 'b'
  return pref
}

export function newGameId(): string {
  return crypto.randomUUID()
}
