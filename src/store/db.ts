import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { GameRecord, MoveRecord } from '../types/game'

interface PrimaDB extends DBSchema {
  games: {
    key: string
    value: GameRecord
  }
  moves: {
    key: [string, number]
    value: MoveRecord
    indexes: { 'by-gameId': string }
  }
}

const DB_NAME = 'prima'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<PrimaDB>> | null = null

export function getDb(): Promise<IDBPDatabase<PrimaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PrimaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('games', { keyPath: 'gameId' })
        const moves = db.createObjectStore('moves', { keyPath: ['gameId', 'ply'] })
        moves.createIndex('by-gameId', 'gameId')
      },
    })
  }
  return dbPromise
}

export async function putGame(game: GameRecord): Promise<void> {
  const db = await getDb()
  await db.put('games', game)
}

export async function putMove(move: MoveRecord): Promise<void> {
  const db = await getDb()
  await db.put('moves', move)
}

export async function getGame(gameId: string): Promise<GameRecord | undefined> {
  const db = await getDb()
  return db.get('games', gameId)
}

export async function getAllGames(): Promise<GameRecord[]> {
  const db = await getDb()
  const games = await db.getAll('games')
  return games.sort((a, b) => b.startedAt - a.startedAt)
}

export async function getMovesForGame(gameId: string): Promise<MoveRecord[]> {
  const db = await getDb()
  const moves = await db.getAllFromIndex('moves', 'by-gameId', gameId)
  return moves.sort((a, b) => a.ply - b.ply)
}

export async function getAllMoves(): Promise<MoveRecord[]> {
  const db = await getDb()
  return db.getAll('moves')
}

export async function replaceAllData(games: GameRecord[], moves: MoveRecord[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['games', 'moves'], 'readwrite')
  await tx.objectStore('games').clear()
  await tx.objectStore('moves').clear()
  for (const game of games) await tx.objectStore('games').put(game)
  for (const move of moves) await tx.objectStore('moves').put(move)
  await tx.done
}
