import { useSearchParams, type To } from 'react-router-dom'
import type { Color } from '../types/config'
import type { EvalComment } from './pgn'

export const DEBUG_PARAM = 'debug'
export const DEBUG_VALUE = 'true'

export interface DebugGameMeta {
  gameId: string
  userColor: Color
  tauRatio: number
  tauWdl: number
  wdlOn: boolean
  bookSize: number
  thresholdElo: number
  opponentElo: number
}

export type DebugVerdict = 'pass' | 'freeze' | 'decoy' | 'skip'

export function useDebugMode(): boolean {
  const [params] = useSearchParams()
  return params.get(DEBUG_PARAM) === DEBUG_VALUE
}

/** Keep `?debug=true` on in-app links when debug mode is on. */
export function debugHref(pathname: string, debug: boolean): To {
  if (!debug) return pathname
  return { pathname, search: `?${DEBUG_PARAM}=${DEBUG_VALUE}` }
}

export function debugVerdict(d: EvalComment): DebugVerdict {
  if (d.skipReason) return 'skip'
  if (d.trigger === 'decoy') return 'decoy'
  if (d.freeze || d.trigger !== 'none') return 'freeze'
  return 'pass'
}

/** Chess move number label: ply 0 → "1.", ply 1 → "1..." */
export function plyLabel(ply: number): string {
  const n = Math.floor(ply / 2) + 1
  return ply % 2 === 0 ? `${n}.` : `${n}...`
}
