import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getAllGames, getAllMoves } from '../store/db'
import type { GameRecord, MoveRecord } from '../types/game'
import { debugHref, useDebugMode } from '../lib/debug'
import { CLOCK_BUCKETS, clockBucket, mean } from '../lib/metrics'
import styles from './DashboardView.module.css'

export function DashboardView() {
  const debug = useDebugMode()
  const [games, setGames] = useState<GameRecord[]>([])
  const [moves, setMoves] = useState<MoveRecord[]>([])

  useEffect(() => {
    void getAllGames().then(setGames)
    void getAllMoves().then(setMoves)
  }, [])

  const evaluated = moves.filter((m) => m.evaluated && m.trigger !== 'decoy')
  const freezes = evaluated.filter((m) => m.trigger !== 'none')
  const uniqueWdlRate =
    freezes.length === 0 ? null : freezes.filter((m) => m.trigger === 'wdl').length / freezes.length

  const clockChart = CLOCK_BUCKETS.map((bucket) => {
    const rows = evaluated.filter((m) => clockBucket(m.clockRemainingMs) === bucket)
    return {
      bucket,
      wdlDelta: mean(rows.map((m) => m.wdlDelta)),
      ratio: mean(rows.map((m) => m.ratio)),
      n: rows.length,
    }
  })

  const trend = useMemo(() => {
    const byGame = new Map<string, { startedAt: number; tau: number; rate: number }>()
    for (const game of games) {
      const rows = evaluated.filter((m) => m.gameId === game.gameId)
      if (rows.length === 0) continue
      byGame.set(game.gameId, {
        startedAt: game.startedAt,
        tau: game.config.tauRatio,
        rate: rows.filter((m) => m.trigger !== 'none').length / rows.length,
      })
    }
    return [...byGame.values()].sort((a, b) => a.startedAt - b.startedAt)
  }, [games, evaluated])

  const byPhase = ['opening', 'middlegame', 'endgame'].map((phase) => {
    const rows = evaluated.filter((m) => m.phase === phase)
    return {
      phase,
      rate:
        rows.length === 0 ? null : rows.filter((m) => m.trigger !== 'none').length / rows.length,
      n: rows.length,
    }
  })

  return (
    <div className={styles.page}>
      <h1>Dashboard</h1>
      <div className={styles.headline}>
        <div className="panel">
          <div className="stat">{uniqueWdlRate === null ? '—' : `${(uniqueWdlRate * 100).toFixed(1)}%`}</div>
          <div className="statLabel">Unique-WDL fire rate</div>
          <p className="hint">Share of real freezes where only Stockfish fired. If this stays near zero, turn the WDL clause off.</p>
        </div>
        <div className="panel">
          <div className="stat">{games.length}</div>
          <div className="statLabel">Games</div>
        </div>
        <div className="panel">
          <div className="stat">{evaluated.length}</div>
          <div className="statLabel">Evaluated moves</div>
        </div>
      </div>

      <section className="panel">
        <h2>Quality versus remaining clock</h2>
        <p className="hint">Mean WDL drop and policy ratio by time left. Decoys excluded.</p>
        <div className={styles.chart}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={clockChart}>
              <CartesianGrid stroke="#212830" />
              <XAxis dataKey="bucket" stroke="#8b98a5" />
              <YAxis yAxisId="left" stroke="#e5534b" />
              <YAxis yAxisId="right" orientation="right" stroke="#79b8ff" />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="wdlDelta" name="mean WDL Δ" stroke="#e5534b" connectNulls />
              <Line yAxisId="right" type="monotone" dataKey="ratio" name="mean ratio" stroke="#79b8ff" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <h2>Freeze rate by phase</h2>
        <ul>
          {byPhase.map((row) => (
            <li key={row.phase}>
              {row.phase}: {row.rate === null ? '—' : `${(row.rate * 100).toFixed(1)}%`} ({row.n})
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Freeze rate over time</h2>
        <p className="hint">Per game, at that game&apos;s τ_ratio.</p>
        <ul>
          {trend.map((row) => (
            <li key={row.startedAt}>
              {new Date(row.startedAt).toLocaleString()} · τ={row.tau} ·{' '}
              {(row.rate * 100).toFixed(1)}%
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Games</h2>
        <ul>
          {games.map((g) => (
            <li key={g.gameId}>
              <Link to={debugHref(`/report/${g.gameId}`, debug)}>
                {new Date(g.startedAt).toLocaleString()} · {g.result}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
