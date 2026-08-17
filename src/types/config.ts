export type FreezeClockMode = 'penalty' | 'running' | 'paused'
export type MaiaVariant = '23m' | '5m'
export type UserColorPref = 'w' | 'b' | 'random'
export type Color = 'w' | 'b'

export interface TimeControl {
  initial: number
  increment: number
}

export interface Config {
  userElo: number
  opponentElo: number
  thresholdElo: number
  tauRatio: number
  tauWdl: number
  wdlClauseEnabled: boolean
  maxRetries: number
  freezeClockMode: FreezeClockMode
  freezePenaltySeconds: number
  decoyFreezeRate: number
  verdictGateMs: number
  openingSkipPlies: number
  timeControl: TimeControl
  sfMovetimeMs: number
  userColor: UserColorPref
  maiaVariant: MaiaVariant
}

export const DEFAULT_CONFIG: Config = {
  userElo: 1500,
  opponentElo: 1500,
  thresholdElo: 2000,
  tauRatio: 0.15,
  tauWdl: 0.12,
  wdlClauseEnabled: true,
  maxRetries: 3,
  freezeClockMode: 'penalty',
  freezePenaltySeconds: 5,
  decoyFreezeRate: 0.08,
  verdictGateMs: 250,
  openingSkipPlies: 12,
  timeControl: { initial: 180, increment: 0 },
  sfMovetimeMs: 80,
  userColor: 'w',
  maiaVariant: '23m',
}

export const CONFIG_STORAGE_KEY = 'blitzdrill.config.v1'
