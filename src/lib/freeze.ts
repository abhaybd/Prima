import type { FreezeTrigger, MoveResolved } from '../types/game'

export type SkipReason = 'opening' | 'forced' | 'terminal'

export interface SkipEvalInput {
  legalMoveCount: number
  afterMoveTerminal: boolean
  inOpeningBook: boolean
}

export function skipEvalReason(input: SkipEvalInput): SkipReason | null {
  if (input.legalMoveCount <= 1) return 'forced'
  if (input.afterMoveTerminal) return 'terminal'
  if (input.inOpeningBook) return 'opening'
  return null
}

export function shouldSkipEval(input: SkipEvalInput): boolean {
  return skipEvalReason(input) !== null
}

export function policyRatio(pMove: number, pTop: number): number {
  if (pTop <= 0) return 1
  return pMove / pTop
}

export interface ChannelVerdict {
  freeze: boolean
  trigger: FreezeTrigger
}

export function freezeVerdict(ratio: number, tauRatio: number): ChannelVerdict {
  if (ratio < tauRatio) return { freeze: true, trigger: 'ratio' }
  return { freeze: false, trigger: 'none' }
}

export function maybeDecoy(
  passed: boolean,
  decoyFreezeRate: number,
  random: () => number = Math.random,
): boolean {
  if (!passed) return false
  return random() < decoyFreezeRate
}

export function isRealFreezeTrigger(trigger: FreezeTrigger): boolean {
  return trigger === 'ratio' || trigger === 'wdl' || trigger === 'both'
}

/** Trigger stored on the ply. A decoy stays a decoy if a later different move passed. */
export function recordedTrigger(
  lastTrigger: FreezeTrigger,
  hadDecoy: boolean,
  hadRealFreeze: boolean,
): FreezeTrigger {
  if (hadRealFreeze || isRealFreezeTrigger(lastTrigger)) return lastTrigger
  if (hadDecoy) return 'decoy'
  return lastTrigger
}

/** True if any attempt on the ply was a real freeze (not a decoy). */
export function plyHadRealFreeze(m: {
  trigger: FreezeTrigger
  retries: number
  hadRealFreeze?: boolean
}): boolean {
  if (m.hadRealFreeze) return true
  if (isRealFreezeTrigger(m.trigger)) return true
  if (m.hadRealFreeze === false || m.trigger === 'decoy') return false
  return m.retries > 0
}

/** Align stored attempts with per-attempt optimality when the ply is committed. */
export function commitAttempts(
  attempts: string[],
  attemptRatios: number[],
  uci: string,
  ratio: number,
  resolved: MoveResolved,
): { attempts: string[]; attemptRatios: number[] } {
  const aligned = attempts.map((_, i) =>
    typeof attemptRatios[i] === 'number' ? attemptRatios[i] : ratio,
  )
  if (attempts.includes(uci)) return { attempts, attemptRatios: aligned }
  return {
    attempts: [...attempts, uci],
    attemptRatios: [...aligned, resolved === 'revealed' ? 1 : ratio],
  }
}

/** Optimality for one attempt. Older records only have a ratio when there was a single try. */
export function ratioForAttempt(
  move: {
    attempts: string[]
    attemptRatios?: number[]
    ratio: number
    evaluated: boolean
  },
  index: number,
): number | null {
  if (!move.evaluated) return null
  const stored = move.attemptRatios?.[index]
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored
  if (move.attempts.length === 1 && index === 0) return move.ratio
  return null
}
