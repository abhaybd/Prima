import type { Config } from '../types/config'
import type { FreezeTrigger } from '../types/game'
import { isExtremeExpected } from './wdl'

export type SkipReason = 'opening' | 'forced' | 'terminal' | 'extreme-wdl'

export interface SkipEvalInput {
  legalMoveCount: number
  afterMoveTerminal: boolean
  inOpeningBook: boolean
  preMoveExpected?: number
  wdlClauseEnabled: boolean
}

export function skipEvalReason(input: SkipEvalInput): SkipReason | null {
  if (input.legalMoveCount <= 1) return 'forced'
  if (input.afterMoveTerminal) return 'terminal'
  if (input.inOpeningBook) return 'opening'
  if (
    input.wdlClauseEnabled &&
    input.preMoveExpected !== undefined &&
    isExtremeExpected(input.preMoveExpected)
  ) {
    return 'extreme-wdl'
  }
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

export function combineChannels(
  ratio: number,
  wdlDeltaValue: number,
  config: Pick<Config, 'tauRatio' | 'tauWdl' | 'wdlClauseEnabled'>,
): ChannelVerdict {
  const ratioFire = ratio < config.tauRatio
  const wdlFire = config.wdlClauseEnabled && wdlDeltaValue > config.tauWdl
  if (ratioFire && wdlFire) return { freeze: true, trigger: 'both' }
  if (ratioFire) return { freeze: true, trigger: 'ratio' }
  if (wdlFire) return { freeze: true, trigger: 'wdl' }
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
