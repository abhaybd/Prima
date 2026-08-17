import type { Color, Config } from './config'

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*'
export type FreezeTrigger = 'none' | 'ratio' | 'wdl' | 'both' | 'decoy'
export type MoveResolved = 'accepted' | 'revealed'
export type GamePhase = 'opening' | 'middlegame' | 'endgame'

export interface GameRecord {
  gameId: string
  startedAt: number
  endedAt: number
  config: Config
  pgn: string
  result: GameResult
  userColor: Color
}

export interface MoveRecord {
  gameId: string
  ply: number
  fen: string
  userMove: string
  attempts: string[]
  ratio: number
  wdlDelta: number
  sfBestMove: string
  thresholdTopMove: string
  trigger: FreezeTrigger
  retries: number
  resolved: MoveResolved
  clockRemainingMs: number
  thinkTimeMs: number
  isForcing: boolean
  phase: GamePhase
  evaluated: boolean
}
