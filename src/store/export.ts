import type { Config } from '../types/config'
import type { GameRecord, MoveRecord } from '../types/game'
import { joinPgns, pgnExportEntries } from '../lib/pgn'
import { zipStore } from '../lib/zip'
import { clearConfig, loadConfig, saveConfig } from './config'
import { getAllGames, getAllMoves, replaceAllData } from './db'
import { clearWelcomeSeen } from './welcome'

export interface ExportPayload {
  version: 1
  exportedAt: number
  config: Config
  games: GameRecord[]
  moves: MoveRecord[]
}

export async function exportDatabase(): Promise<string> {
  const payload: ExportPayload = {
    version: 1,
    exportedAt: Date.now(),
    config: loadConfig(),
    games: await getAllGames(),
    moves: await getAllMoves(),
  }
  return JSON.stringify(payload, null, 2)
}

export async function importDatabase(json: string): Promise<void> {
  const data = JSON.parse(json) as Partial<ExportPayload>
  if (data.version !== 1 || !Array.isArray(data.games) || !Array.isArray(data.moves)) {
    throw new Error('Invalid backup file')
  }
  if (data.config) saveConfig(data.config)
  await replaceAllData(data.games, data.moves)
}

export async function clearStoredData(): Promise<void> {
  clearConfig()
  clearWelcomeSeen()
  await replaceAllData([], [])
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadText(
  filename: string,
  text: string,
  mime = 'application/json',
): void {
  downloadBlob(filename, new Blob([text], { type: mime }))
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export function downloadGamesPgn(games: GameRecord[], debug: boolean): void {
  const entries = pgnExportEntries(games, debug)
  if (entries.length === 0) return
  downloadText(
    `prima-games-${dateStamp()}.pgn`,
    joinPgns(entries.map((e) => e.pgn)),
    'application/x-chess-pgn',
  )
}

export function downloadGamesPgnZip(games: GameRecord[], debug: boolean): void {
  const entries = pgnExportEntries(games, debug)
  if (entries.length === 0) return
  const zip = zipStore(
    entries.map((e) => ({ name: e.filename, data: new TextEncoder().encode(e.pgn) })),
  )
  downloadBlob(`prima-games-${dateStamp()}.zip`, new Blob([zip], { type: 'application/zip' }))
}
