import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import type { Square } from 'chess.js'
import { getGame, getMovesForGame } from '../store/db'
import { downloadText } from '../store/export'
import { debugHref, useDebugMode } from '../lib/debug'
import { pgnForDisplay } from '../lib/pgn'
import { plyHadRealFreeze, ratioForAttempt } from '../lib/freeze'
import type { GameRecord, MoveRecord } from '../types/game'
import { applyUci, newChess, parseUci, uciToSan } from '../lib/chess'
import { loadOpeningBook, type OpeningBook } from '../lib/openingBook'
import { formatOptimality, mean } from '../lib/metrics'
import styles from './ReportView.module.css'

export function ReportView() {
  const { gameId } = useParams()
  const debug = useDebugMode()
  const [game, setGame] = useState<GameRecord | undefined>()
  const [moves, setMoves] = useState<MoveRecord[]>([])
  const [selected, setSelected] = useState<MoveRecord | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'not-found'>('loading')
  const [copied, setCopied] = useState(false)
  const [book, setBook] = useState<OpeningBook | null>(null)

  useEffect(() => {
    if (!gameId) {
      setLoadState('not-found')
      return
    }
    let cancelled = false
    setLoadState('loading')
    setGame(undefined)
    setMoves([])
    setSelected(null)
    setCopied(false)
    void getGame(gameId)
      .then((record) => {
        if (cancelled) return
        if (!record) {
          setLoadState('not-found')
          return
        }
        setGame(record)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('not-found')
      })
    void getMovesForGame(gameId)
      .then((rows) => {
        if (cancelled) return
        setMoves(rows)
        setSelected(rows.find((m) => plyHadRealFreeze(m) || m.trigger === 'decoy') ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [gameId])

  useEffect(() => {
    let cancelled = false
    void loadOpeningBook()
      .then((loaded) => {
        if (!cancelled) setBook(loaded)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const bookPlies = useMemo(() => {
    if (!book) return new Set<number>()
    const plies = new Set<number>()
    for (const m of moves) {
      const chess = newChess(m.fen)
      if (applyUci(chess, m.userMove) && book.hasFen(chess.fen())) plies.add(m.ply)
    }
    return plies
  }, [book, moves])

  const evaluated = moves.filter((m) => m.evaluated && m.trigger !== 'decoy')
  const freezes = evaluated.filter((m) => m.trigger !== 'none')
  const stats = useMemo(() => {
    return {
      freezeCount: freezes.length,
      misses: evaluated.filter((m) => m.resolved === 'revealed').length,
      meanRetries: mean(freezes.map((m) => m.retries)),
      meanRatio: mean(evaluated.map((m) => m.ratio)),
      forcingRate:
        evaluated.filter((m) => m.isForcing).length === 0
          ? null
          : evaluated.filter((m) => m.isForcing && m.trigger !== 'none').length /
            Math.max(1, evaluated.filter((m) => m.isForcing).length),
      quietRate:
        evaluated.filter((m) => !m.isForcing).length === 0
          ? null
          : evaluated.filter((m) => !m.isForcing && m.trigger !== 'none').length /
            Math.max(1, evaluated.filter((m) => !m.isForcing).length),
    }
  }, [evaluated, freezes])

  const pgn = game?.pgn ? pgnForDisplay(game.pgn, debug) : ''

  if (loadState === 'not-found') {
    return (
      <div className={styles.notFound}>
        <div>
          <h1>404</h1>
          <p>Game not found.</p>
        </div>
      </div>
    )
  }
  if (loadState !== 'ready' || !game) return <p>Loading…</p>

  return (
    <div className={styles.page}>
      <h1>Game report</h1>
      <p className="hint">
        {game.result} · you were {game.userColor === 'w' ? 'White' : 'Black'} · vs{' '}
        {game.config.opponentElo} Elo ·{' '}
        <Link to={debugHref('/dashboard', debug)}>Dashboard</Link>
      </p>
      <div className={styles.stats}>
        <Stat label="Freezes" value={stats.freezeCount} />
        <Stat label="Misses" value={stats.misses} />
        <Stat label="Mean retries" value={fmt(stats.meanRetries)} />
        <Stat label="Mean optimality" value={formatOptimality(stats.meanRatio, 1)} />
        <Stat label="Forcing freeze rate" value={pct(stats.forcingRate)} />
        <Stat label="Quiet freeze rate" value={pct(stats.quietRate)} />
      </div>
      {pgn ? (
        <div className="panel">
          <div className={styles.pgnHead}>
            <h2>PGN</h2>
            <div className={styles.pgnActions}>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(pgn).then(() => {
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 1500)
                  })
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  downloadText(
                    `blitzdrill-${game.gameId}.pgn`,
                    pgn,
                    'application/x-chess-pgn',
                  )
                }
              >
                Download
              </button>
            </div>
          </div>
          <pre className={styles.pgn}>{pgn}</pre>
        </div>
      ) : null}
      <div className={styles.split}>
        <div className="panel">
          <h2>Moves</h2>
          <table className={`${styles.table} ${styles.moves}`}>
            <thead>
              <tr>
                <th>#</th>
                <th>Move</th>
                <th>Optimality</th>
                <th>Retries</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr
                  key={`${m.gameId}-${m.ply}`}
                  className={[
                    plyHadRealFreeze(m) ? styles.freeze : m.trigger === 'decoy' ? styles.decoy : '',
                    selected?.ply === m.ply ? styles.sel : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={
                    m.trigger === 'decoy'
                      ? 'Decoy: a passing move was frozen anyway so a freeze is not a free hint that the move was wrong.'
                      : undefined
                  }
                  onClick={() => setSelected(m)}
                >
                  <td>{Math.floor(m.ply / 2) + 1}</td>
                  <td>
                    <span className={styles.moveCell}>
                      {uciToSan(m.fen, m.userMove)}
                      {bookPlies.has(m.ply) ? (
                        <span className={styles.book} title="Opening book">
                          <BookIcon />
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    <OptimalityCell value={m.evaluated ? m.ratio : null} />
                  </td>
                  <td>{m.retries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h2>Replay</h2>
          {selected ? (
            <>
              <div className={styles.mini}>
                <Chessboard
                  position={selected.fen}
                  arePiecesDraggable={false}
                  animationDuration={0}
                  customArrows={replayArrows(selected)}
                  customDarkSquareStyle={{ backgroundColor: '#3d5a4c' }}
                  customLightSquareStyle={{ backgroundColor: '#e8eddf' }}
                />
              </div>
              <div className={styles.replayMeta}>
                {selected.sfBestMove ? (
                  <p>
                    Engine: {uciToSan(selected.fen, selected.sfBestMove)}
                  </p>
                ) : null}
                <p>
                  Played:{' '}
                  {selected.userMove ? uciToSan(selected.fen, selected.userMove) : '—'}
                </p>
                <p>
                  Expert:{' '}
                  {selected.thresholdTopMove
                    ? uciToSan(selected.fen, selected.thresholdTopMove)
                    : '—'}
                </p>
                {selected.attempts.length > 0 ? (
                  <table className={`${styles.table} ${styles.attemptsTable}`}>
                    <caption>Attempts</caption>
                    <thead>
                      <tr>
                        <th>Move</th>
                        <th>Optimality</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.attempts.map((uci, i) => {
                        const played = i === selected.attempts.lastIndexOf(selected.userMove)
                        return (
                          <tr
                            key={`${selected.ply}-${i}-${uci}`}
                            className={played ? styles.playedAttempt : undefined}
                          >
                            <td>
                              {uciToSan(selected.fen, uci)}
                              {played ? ' · played' : ''}
                            </td>
                            <td>
                              <OptimalityCell value={ratioForAttempt(selected, i)} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p>Attempts: —</p>
                )}
                <p>
                  {selected.trigger === 'decoy' ? 'Decoy · ' : ''}
                  {selected.resolved === 'revealed' ? 'hint shown' : selected.resolved}
                </p>
              </div>
            </>
          ) : (
            <p className="hint">Select a freeze to replay the position.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel">
      <div className="stat">{value}</div>
      <div className="statLabel">{label}</div>
    </div>
  )
}

function fmt(v: number | null): string {
  return v === null ? '—' : v.toFixed(3)
}

function pct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`
}

function replayArrows(move: MoveRecord): [Square, Square, string][] {
  const arrows: [Square, Square, string][] = []
  const expert = arrowFromUci(move.thresholdTopMove, '#f0c14b')
  if (expert) arrows.push(expert)
  if (move.userMove && move.userMove !== move.thresholdTopMove) {
    const played = arrowFromUci(move.userMove, '#6cb6ff')
    if (played) arrows.push(played)
  }
  return arrows
}

function arrowFromUci(uci: string, color: string): [Square, Square, string] | null {
  if (!uci || uci.length < 4) return null
  const { from, to } = parseUci(uci)
  return [from, to, color]
}

function OptimalityCell({ value }: { value: number | null }) {
  if (value === null) return '—'
  return (
    <span className={styles.optimality}>
      <span className={styles.optimalityNum}>{(value * 100).toFixed(0)}</span>%
    </span>
  )
}

function BookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}
