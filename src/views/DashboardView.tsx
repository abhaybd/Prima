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
import { CLOCK_BUCKETS, clockBucket, formatOptimality, mean } from '../lib/metrics'
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
  const freezeRate =
    evaluated.length === 0
      ? null
      : evaluated.filter((m) => m.trigger !== 'none').length / evaluated.length

  const clockChart = CLOCK_BUCKETS.map((bucket) => {
    const rows = evaluated.filter((m) => clockBucket(m.clockRemainingMs) === bucket)
    const ratio = mean(rows.map((m) => m.ratio))
    return {
      bucket,
      optimality: ratio === null ? null : ratio * 100,
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
          <div className="stat">{freezeRate === null ? '—' : `${(freezeRate * 100).toFixed(1)}%`}</div>
          <div className="statLabel">Freeze rate</div>
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
        <p className="hint">Mean optimality (↑ better) by time left. Decoys excluded.</p>
        <div className={styles.chart}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={clockChart} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#212830" />
              <XAxis dataKey="bucket" stroke="#8b98a5" />
              <YAxis
                stroke="#79b8ff"
                width={72}
                label={{
                  value: 'optimality % ↑',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: '#79b8ff', fontSize: 12 },
                }}
              />
              <Tooltip formatter={formatChartTooltip} />
              <Legend />
              <Line
                type="monotone"
                dataKey="optimality"
                name="optimality (↑)"
                stroke="#79b8ff"
                connectNulls
              />
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
        <p className="hint">Per game, at that game&apos;s min optimality.</p>
        <ul>
          {trend.map((row) => (
            <li key={row.startedAt}>
              {new Date(row.startedAt).toLocaleString()} · min optimality{' '}
              {formatOptimality(row.tau)} · {(row.rate * 100).toFixed(1)}%
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
                {new Date(g.startedAt).toLocaleString()} · {g.result} · vs {g.config.opponentElo} Elo
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function formatChartTooltip(
  value: unknown,
  name: string,
  item: { dataKey?: string | number },
): [string, string] {
  if (typeof value !== 'number') return ['—', name]
  if (item.dataKey === 'optimality') return [`${value.toFixed(1)}%`, name]
  return [String(value), name]
}
