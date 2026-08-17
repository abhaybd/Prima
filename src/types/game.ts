import type { Color, Config } from './config'

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*'
export type FreezeTrigger = 'none' | 'ratio' | 'wdl' | 'both' | 'decoy'
export type MoveResolved = 'accepted' | 'revealed'
export type GamePhase = 'opening' | 'middlegame' | 'endgame'

/** White POV. `pawns` is always centipawns/100; `mate` is set only when SF reported mate. */
export interface SfEval {
  pawns: number
  mate?: number
}

export interface SfEvalPoint extends SfEval {
  ply: number
}

export interface GameRecord {
  gameId: string
  startedAt: number
  endedAt: number
  config: Config
  pgn: string
  result: GameResult
  userColor: Color
  /** Eval after each committed ply (user and opponent), White POV. Absent on older games. */
  sfEvals?: SfEvalPoint[]
}

export interface MoveRecord {
  gameId: string
  ply: number
  fen: string
  userMove: string
  attempts: string[]
  /** Per-attempt optimality, parallel to `attempts`. Absent on older records. */
  attemptRatios?: number[]
  ratio: number
  wdlDelta: number
  sfBestMove: string
  /** White POV pawns after this user move. Absent until Stockfish finishes, and on older records. */
  sfEval?: number
  /** White POV mate-in-N after this user move, when Stockfish reported mate. */
  sfMate?: number
  thresholdTopMove: string
  trigger: FreezeTrigger
  retries: number
  resolved: MoveResolved
  clockRemainingMs: number
  thinkTimeMs: number
  isForcing: boolean
  phase: GamePhase
  evaluated: boolean
  /** True if any attempt on this ply failed the optimality freeze. Absent on older records. */
  hadRealFreeze?: boolean
}
