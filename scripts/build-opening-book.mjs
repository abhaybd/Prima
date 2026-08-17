import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'

const BOOK_URL =
  'https://github.com/official-stockfish/books/raw/refs/heads/master/8moves_v3.pgn.zip'
/** First 6 full moves (12 plies) of each 8moves_v3 line. */
const BOOK_MAX_PLIES = 12
const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n

function positionKey(fen) {
  return fen.split(' ').slice(0, 4).join(' ')
}

function hashPositionKey(key) {
  let hash = FNV_OFFSET
  for (let i = 0; i < key.length; i++) {
    hash ^= BigInt(key.charCodeAt(i))
    hash = BigInt.asUintN(64, hash * FNV_PRIME)
  }
  return hash
}

function sansOf(movetext) {
  return movetext
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .replace(/1-0|0-1|1\/2-1\/2|\*/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = resolve(root, 'public/books/8moves_v3.u64')
const zipPath = resolve(tmpdir(), '8moves_v3.pgn.zip')

let pgn
if (process.argv[2]) {
  pgn = readFileSync(process.argv[2], 'utf8')
} else {
  if (!existsSync(zipPath)) {
    console.log(`Downloading ${BOOK_URL}`)
    writeFileSync(zipPath, Buffer.from(await (await fetch(BOOK_URL)).arrayBuffer()))
  } else {
    console.log(`Using cached ${zipPath}`)
  }
  const unzip = spawnSync('unzip', ['-p', zipPath], { encoding: 'utf8', maxBuffer: 20_000_000 })
  if (unzip.status !== 0) throw new Error(unzip.stderr || 'unzip failed')
  pgn = unzip.stdout
}

const hashes = new Set()
const chess = new Chess()
hashes.add(hashPositionKey(positionKey(chess.fen())))

let parsed = 0
let failed = 0
for (const block of pgn.split(/\n\s*\n/)) {
  const moveLines = block
    .split('\n')
    .filter((line) => !line.startsWith('['))
    .join(' ')
  if (!moveLines.trim()) continue
  const sans = sansOf(moveLines)
  if (sans.length === 0) continue
  chess.reset()
  try {
    for (const san of sans.slice(0, BOOK_MAX_PLIES)) {
      chess.move(san)
      hashes.add(hashPositionKey(positionKey(chess.fen())))
    }
  } catch {
    failed++
    continue
  }
  parsed++
}

const sorted = [...hashes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
const buf = Buffer.alloc(sorted.length * 8)
sorted.forEach((hash, i) => buf.writeBigUInt64LE(hash, i * 8))
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, buf)
console.log(
  `Wrote ${outPath} (${sorted.length} positions through ply ${BOOK_MAX_PLIES}, ${parsed} games, ${failed} failed)`,
)
