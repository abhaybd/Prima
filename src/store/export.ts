import type { Config } from '../types/config'
import type { GameRecord, MoveRecord } from '../types/game'
import { loadConfig, saveConfig } from './config'
import { getAllGames, getAllMoves, replaceAllData } from './db'

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

export function downloadText(
  filename: string,
  text: string,
  mime = 'application/json',
): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
