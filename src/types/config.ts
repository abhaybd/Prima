export type FreezeClockMode = 'penalty' | 'running' | 'paused' | 'grace'
export type MaiaVariant = '23m' | '5m'
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
  timeControl: TimeControl
  userColor: UserColorPref
  maiaVariant: MaiaVariant
}

export const DEFAULT_CONFIG: Config = {
  configVersion: 3,
  opponentElo: 1000,
  thresholdElo: 2000,
  tauRatio: 0.15,
  maxRetries: 3,
  freezeClockMode: 'penalty',
  freezePenaltySeconds: 5,
  freezeGraceSeconds: 3,
  decoyFreezeRate: 0.08,
  timeControl: { initial: 180, increment: 0 },
  userColor: 'w',
  maiaVariant: '23m',
}

export const CONFIG_STORAGE_KEY = 'blitzdrill.config.v1'
