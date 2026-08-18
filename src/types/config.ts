export type FreezeClockMode = 'penalty' | 'running' | 'paused' | 'grace'
export type MaiaVariant = '23m' | '5m'
export type OpponentSampleMode = 'nucleus' | 'argmax'
export type UserColorPref = 'w' | 'b' | 'random'
export type Color = 'w' | 'b'

export interface TimeControl {
  initial: number
  increment: number
}

export interface Config {
  configVersion: number
  opponentElo: number
  thresholdElo: number
  tauRatio: number
  maxRetries: number
  freezeClockMode: FreezeClockMode
  freezePenaltySeconds: number
  freezeGraceSeconds: number
  decoyFreezeRate: number
  gameDecidedThreshold: number
  timeControl: TimeControl
  userColor: UserColorPref
  maiaVariant: MaiaVariant
  opponentSampleMode: OpponentSampleMode
  opponentTopP: number
}

export const DEFAULT_CONFIG: Config = {
  configVersion: 5,
  opponentElo: 1000,
  thresholdElo: 2000,
  tauRatio: 0.15,
  maxRetries: 3,
  freezeClockMode: 'penalty',
  freezePenaltySeconds: 5,
  freezeGraceSeconds: 3,
  decoyFreezeRate: 0.08,
  gameDecidedThreshold: 7,
  timeControl: { initial: 180, increment: 0 },
  userColor: 'w',
  maiaVariant: '23m',
  opponentSampleMode: 'nucleus',
  opponentTopP: 0.8,
}

export const CONFIG_STORAGE_KEY = 'prima.config.v1'
