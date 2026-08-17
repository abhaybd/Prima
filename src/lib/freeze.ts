import type { Config } from '../types/config'
import type { FreezeTrigger } from '../types/game'
import { isExtremeExpected } from './wdl'

export interface SkipEvalInput {
  ply: number
  legalMoveCount: number
  afterMoveTerminal: boolean
  openingSkipPlies: number
  preMoveExpected?: number
  wdlClauseEnabled: boolean
}

export function shouldSkipEval(input: SkipEvalInput): boolean {
  if (input.ply < input.openingSkipPlies) return true
  if (input.legalMoveCount <= 1) return true
  if (input.afterMoveTerminal) return true
  if (
    input.wdlClauseEnabled &&
    input.preMoveExpected !== undefined &&
    isExtremeExpected(input.preMoveExpected)
  ) {
    return true
  }
  return false
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
