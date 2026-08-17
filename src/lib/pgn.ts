import { Chess } from 'chess.js'
import type { FreezeTrigger, MoveResolved } from '../types/game'
import type { SkipReason } from './freeze'
import type { Wdl } from './wdl'

export const EVAL_LOG_PREFIX = '[blitzdrill]'

export interface EvalComment {
  ply: number
  uci: string
  evaluated: boolean
  skipReason?: SkipReason
  pMove?: number
  pTop?: number
  ratio?: number
  eBest?: number
  eAfter?: number
  wdlDelta?: number
  wdlStm?: Wdl
  wdlAfterStm?: Wdl
  trigger: FreezeTrigger
  freeze: boolean
  sfBestMove?: string
  thresholdTopMove?: string
  tauRatio?: number
  tauWdl?: number
  wdlClauseEnabled?: boolean
  retries?: number
  attempts?: string[]
  resolved?: MoveResolved
}

function fmt(n: number, digits: number): string {
  return n.toFixed(digits)
}

function fmtWdl(wdl: Wdl): string {
  return `${wdl.w}/${wdl.d}/${wdl.l}`
}

/** Compact PGN-safe comment (no braces). */
export function formatEvalComment(d: EvalComment): string {
  const parts = [`ply=${d.ply}`, `uci=${d.uci}`]
  if (d.skipReason) parts.push(`skip=${d.skipReason}`)
  parts.push(`eval=${d.evaluated ? 'yes' : 'no'}`)
  if (d.pMove !== undefined) parts.push(`p=${fmt(d.pMove, 4)}`)
  if (d.pTop !== undefined) parts.push(`pTop=${fmt(d.pTop, 4)}`)
  if (d.ratio !== undefined) parts.push(`ratio=${fmt(d.ratio, 3)}`)
  if (d.eBest !== undefined) parts.push(`eBest=${fmt(d.eBest, 3)}`)
  if (d.eAfter !== undefined) parts.push(`eAfter=${fmt(d.eAfter, 3)}`)
  if (d.wdlDelta !== undefined) parts.push(`wdlD=${fmt(d.wdlDelta, 3)}`)
  if (d.wdlStm) parts.push(`wdl=${fmtWdl(d.wdlStm)}`)
  if (d.wdlAfterStm) parts.push(`wdlAfter=${fmtWdl(d.wdlAfterStm)}`)
  parts.push(`trig=${d.trigger}`)
  parts.push(`freeze=${d.freeze ? 'yes' : 'no'}`)
  if (d.resolved) parts.push(`res=${d.resolved}`)
  if (d.retries !== undefined && d.retries > 0) parts.push(`retries=${d.retries}`)
  if (d.attempts && d.attempts.length > 1) parts.push(`tries=${d.attempts.join(',')}`)
  if (d.sfBestMove) parts.push(`sf=${d.sfBestMove}`)
  if (d.thresholdTopMove) parts.push(`maia=${d.thresholdTopMove}`)
  if (d.tauRatio !== undefined) parts.push(`tauR=${fmt(d.tauRatio, 2)}`)
  if (d.tauWdl !== undefined) parts.push(`tauW=${fmt(d.tauWdl, 2)}`)
  if (d.wdlClauseEnabled !== undefined) parts.push(`wdlOn=${d.wdlClauseEnabled ? 'yes' : 'no'}`)
  return parts.join(' ')
}

export function pgnWithEvalComments(
  sans: string[],
  commentsByPly: ReadonlyMap<number, string>,
  headers: Record<string, string> = {},
): string {
  const chess = new Chess()
  for (const [key, value] of Object.entries(headers)) {
    chess.setHeader(key, value)
  }
  for (const san of sans) {
    chess.move(san)
    const ply = chess.history().length - 1
    const comment = commentsByPly.get(ply)
    if (comment) chess.setComment(comment)
  }
  return chess.pgn()
}

export function logEvalComment(d: EvalComment): string {
  const text = formatEvalComment(d)
  console.info(EVAL_LOG_PREFIX, text)
  return text
}

export function logGamePgn(pgn: string): void {
  console.info(`${EVAL_LOG_PREFIX} pgn\n${pgn}`)
}
