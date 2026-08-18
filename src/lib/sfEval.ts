import type { SfEval, SfEvalPoint } from '../types/game'

export type UciScore = { kind: 'cp'; cp: number } | { kind: 'mate'; mate: number }

const MATE_PAWNS = 100

/** Last `score cp` / `score mate` on a UCI info line. */
export function parseUciScore(infoLine: string): UciScore | null {
  const mate = /\bscore\s+mate\s+\+?(-?\d+)\b/.exec(infoLine)
  if (mate) return { kind: 'mate', mate: Number(mate[1]) }
  const cp = /\bscore\s+cp\s+\+?(-?\d+)\b/.exec(infoLine)
  if (cp) return { kind: 'cp', cp: Number(cp[1]) }
  return null
}

export function sideToMoveFromFen(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}

/** STM score in pawns. Centipawns are divided by 100; mate is a large equivalent. */
export function stmScoreToPawns(score: UciScore): number {
  if (score.kind === 'cp') return score.cp / 100
  const n = score.mate
  if (n === 0) return -MATE_PAWNS
  const mag = MATE_PAWNS - Math.min(Math.abs(n), MATE_PAWNS - 1)
  return n > 0 ? mag : -mag
}

export function whitePovPawns(stmPawns: number, sideToMove: 'w' | 'b'): number {
  return sideToMove === 'w' ? stmPawns : -stmPawns
}

export function whitePovMate(stmMate: number, sideToMove: 'w' | 'b'): number {
  return sideToMove === 'w' ? stmMate : -stmMate
}

/** White-POV eval when `matedSide` is checkmated (they are to move and have no legal replies). */
export function evalFromCheckmate(matedSide: 'w' | 'b'): SfEval {
  return { pawns: matedSide === 'w' ? -MATE_PAWNS : MATE_PAWNS, mate: 0 }
}

/** White-POV pawns for mate-now after `ply` (even = White just moved). */
export function mate0WhitePovPawns(ply: number): number {
  return ply % 2 === 0 ? MATE_PAWNS : -MATE_PAWNS
}

/** `mate 0` has no sign; use ply so a White mate is never shown as Black's. */
export function normalizeMate0Eval(eval_: SfEval, ply: number): SfEval {
  if (eval_.mate !== 0) return eval_
  const pawns = mate0WhitePovPawns(ply)
  if (eval_.pawns === pawns) return eval_
  return { ...eval_, pawns }
}

/** Use the last score in `lines` (deepest info before bestmove). */
export function evalFromInfoLines(lines: readonly string[], sideToMove: 'w' | 'b'): SfEval {
  let last: UciScore | null = null
  for (const line of lines) {
    const parsed = parseUciScore(line)
    if (parsed) last = parsed
  }
  if (!last) return { pawns: 0 }
  const pawns = whitePovPawns(stmScoreToPawns(last), sideToMove)
  if (last.kind === 'mate') {
    const mate = last.mate === 0 ? 0 : whitePovMate(last.mate, sideToMove)
    return { pawns, mate }
  }
  return { pawns }
}

export function formatEvalPawns(eval_: SfEval | null | undefined): string {
  if (!eval_) return '—'
  const { mate, pawns } = eval_
  if (mate != null) {
    if (mate === 0) return pawns < 0 ? '-#' : '#'
    return mate > 0 ? `#${mate}` : `-#${-mate}`
  }
  const v = Math.round(pawns * 100) / 100
  if (v === 0) return '0.00'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
}

export function evalAtPly(
  ply: number,
  move: { sfEval?: number; sfMate?: number } | undefined,
  timeline: readonly SfEvalPoint[] | undefined,
): SfEval | null {
  if (move?.sfEval !== undefined) {
    const raw = move.sfMate != null ? { pawns: move.sfEval, mate: move.sfMate } : { pawns: move.sfEval }
    return normalizeMate0Eval(raw, ply)
  }
  const point = timeline?.find((p) => p.ply === ply)
  return point ? normalizeMate0Eval({ pawns: point.pawns, mate: point.mate }, ply) : null
}

export function timelineFromMoves(
  moves: readonly { ply: number; sfEval?: number; sfMate?: number }[],
): SfEvalPoint[] {
  return moves
    .filter((m) => m.sfEval !== undefined)
    .map((m) => {
      const point: SfEvalPoint = { ply: m.ply, pawns: m.sfEval as number }
      if (m.sfMate != null) point.mate = m.sfMate
      return point
    })
    .sort((a, b) => a.ply - b.ply)
}

export function clampEvalForChart(pawns: number, cap = 8): number {
  return Math.max(-cap, Math.min(cap, pawns))
}
