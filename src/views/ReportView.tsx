import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { getGame, getMovesForGame } from '../store/db'
import { downloadText } from '../store/export'
import { debugHref, useDebugMode } from '../lib/debug'
import { pgnForDisplay } from '../lib/pgn'
import type { GameRecord, MoveRecord } from '../types/game'
import { mean } from '../lib/metrics'
import styles from './ReportView.module.css'

export function ReportView() {
  const { gameId } = useParams()
  const debug = useDebugMode()
  const [game, setGame] = useState<GameRecord | undefined>()
  const [moves, setMoves] = useState<MoveRecord[]>([])
  const [selected, setSelected] = useState<MoveRecord | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'not-found'>('loading')

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
        setSelected(rows.find((m) => m.trigger !== 'none') ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [gameId])

  const evaluated = moves.filter((m) => m.evaluated && m.trigger !== 'decoy')
  const freezes = evaluated.filter((m) => m.trigger !== 'none')
  const stats = useMemo(() => {
    const by = (t: MoveRecord['trigger']) => freezes.filter((m) => m.trigger === t).length
    return {
      freezeCount: freezes.length,
      ratio: by('ratio'),
      wdl: by('wdl'),
      both: by('both'),
      misses: evaluated.filter((m) => m.resolved === 'revealed').length,
      meanRetries: mean(freezes.map((m) => m.retries)),
      meanWdl: mean(evaluated.map((m) => m.wdlDelta)),
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
        {game.result} · you were {game.userColor === 'w' ? 'White' : 'Black'} ·{' '}
        <Link to={debugHref('/dashboard', debug)}>Dashboard</Link>
      </p>
      <div className={styles.stats}>
        <Stat label="Freezes" value={stats.freezeCount} />
        <Stat label="Ratio / WDL / both" value={`${stats.ratio} / ${stats.wdl} / ${stats.both}`} />
        <Stat label="Misses" value={stats.misses} />
        <Stat label="Mean retries" value={fmt(stats.meanRetries)} />
        <Stat label="Mean WDL Δ" value={fmt(stats.meanWdl)} />
        <Stat label="Mean ratio" value={fmt(stats.meanRatio)} />
        <Stat label="Forcing freeze rate" value={pct(stats.forcingRate)} />
        <Stat label="Quiet freeze rate" value={pct(stats.quietRate)} />
      </div>
      {pgn ? (
        <div className="panel">
          <div className={styles.pgnHead}>
            <h2>PGN</h2>
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
          <pre className={styles.pgn}>{pgn}</pre>
        </div>
      ) : null}
      <div className={styles.split}>
        <div className="panel">
          <h2>Moves</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ply</th>
                <th>Move</th>
                <th>Trigger</th>
                <th>Ratio</th>
                <th>WDL Δ</th>
                <th>Retries</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr
                  key={`${m.gameId}-${m.ply}`}
                  className={selected?.ply === m.ply ? styles.sel : ''}
                  onClick={() => setSelected(m)}
                >
                  <td>{m.ply}</td>
                  <td>{m.userMove}</td>
                  <td>{m.trigger}</td>
                  <td>{m.evaluated ? m.ratio.toFixed(2) : '—'}</td>
                  <td>{m.evaluated ? m.wdlDelta.toFixed(3) : '—'}</td>
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
                  customDarkSquareStyle={{ backgroundColor: '#3d5a4c' }}
                  customLightSquareStyle={{ backgroundColor: '#e8eddf' }}
                />
              </div>
              <p>
                Attempts: {selected.attempts.join(', ') || '—'}
                <br />
                Engine best: {selected.sfBestMove || '—'}
                <br />
                Threshold top: {selected.thresholdTopMove || '—'}
                <br />
                Trigger: {selected.trigger} · {selected.resolved}
              </p>
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
