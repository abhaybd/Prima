export interface Wdl {
  w: number
  d: number
  l: number
}

/** Expected score from the side-to-move, in [0, 1]. */
export function expectedScore(wdl: Wdl): number {
  return (wdl.w + 0.5 * wdl.d) / 1000
}

/** Convert a side-to-move expected score into the user's expected score. */
export function userPovExpected(stmExpected: number, userIsSideToMove: boolean): number {
  return userIsSideToMove ? stmExpected : 1 - stmExpected
}

/**
 * wdlDelta = E(best from user POV) - E(after move from user POV).
 * Positive means the user's move lost expected score versus Stockfish's best.
 */
export function wdlDelta(bestUserPov: number, afterUserPov: number): number {
  return bestUserPov - afterUserPov
}

export function parseWdl(infoLine: string): Wdl | null {
  const match = /\bwdl\s+(\d+)\s+(\d+)\s+(\d+)\b/.exec(infoLine)
  if (!match) return null
  return { w: Number(match[1]), d: Number(match[2]), l: Number(match[3]) }
}

export function parseBestMove(line: string): string | null {
  const match = /^bestmove\s+(\S+)/.exec(line.trim())
  if (!match || match[1] === '(none)' || match[1] === '0000') return null
  return match[1]
}

export function isExtremeExpected(e: number): boolean {
  return e < 0.03 || e > 0.97
}
