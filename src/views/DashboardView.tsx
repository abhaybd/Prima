import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getAllGames, getAllMoves } from '../store/db'
import { downloadGamesPgn, downloadGamesPgnZip } from '../store/export'
import type { GameRecord, MoveRecord } from '../types/game'
import { debugHref, useDebugMode } from '../lib/debug'
import { CLOCK_BUCKETS, clockBucket, formatOptimality, meanCi95 } from '../lib/metrics'
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
    const stats = meanCi95(rows.map((m) => m.ratio))
    if (!stats) {
      return {
        bucket,
        optimality: null,
        ciLow: null,
        ciHigh: null,
        bandBase: null,
        bandSpan: null,
        n: 0,
      }
    }
    const optimality = stats.mean * 100
    const ciLow = stats.low === null ? null : clampPct(stats.low * 100)
    const ciHigh = stats.high === null ? null : clampPct(stats.high * 100)
    return {
      bucket,
      optimality,
      ciLow,
      ciHigh,
      bandBase: ciLow ?? optimality,
      bandSpan: ciLow === null || ciHigh === null ? 0 : ciHigh - ciLow,
      n: stats.n,
    }
  })
  const clockDomain = optimalityDomain(clockChart)

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
        <p className="hint">Mean optimality (↑ better) by time left, with 95% CI. Decoys excluded.</p>
        <div className={styles.chart}>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={clockChart} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#212830" />
              <XAxis dataKey="bucket" stroke="#8b98a5" />
              <YAxis
                stroke="#79b8ff"
                width={72}
                domain={clockDomain}
                label={{
                  value: 'optimality % (↑)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: '#79b8ff', fontSize: 12 },
                }}
              />
              <Tooltip content={<ClockTooltip />} />
              <Area
                type="monotone"
                dataKey="bandBase"
                stackId="ci"
                stroke="none"
                fill="transparent"
                legendType="none"
                tooltipType="none"
                connectNulls
                isAnimationActive={false}
                dot={false}
                activeDot={false}
              />
              <Area
                type="monotone"
                dataKey="bandSpan"
                stackId="ci"
                stroke="none"
                fill="#79b8ff"
                fillOpacity={0.22}
                legendType="none"
                tooltipType="none"
                connectNulls
                isAnimationActive={false}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="optimality"
                stroke="#79b8ff"
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
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
        <div className={styles.gamesHead}>
          <h2>Games</h2>
          <DownloadAllMenu games={games} debug={debug} />
        </div>
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

function DownloadAllMenu({ games, debug }: { games: GameRecord[]; debug: boolean }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const canDownload = games.some((g) => g.pgn.trim().length > 0)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={styles.dropdown} ref={rootRef}>
      <button
        type="button"
        className="secondary"
        disabled={!canDownload}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Download all
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              downloadGamesPgn(games, debug)
              setOpen(false)
            }}
          >
            Single PGN
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              downloadGamesPgnZip(games, debug)
              setOpen(false)
            }}
          >
            Zip of PGNs
          </button>
        </div>
      ) : null}
    </div>
  )
}

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n))
}

function optimalityDomain(
  rows: { optimality: number | null; ciLow: number | null; ciHigh: number | null }[],
): [number, number] {
  const ys = rows
    .flatMap((r) => [r.optimality, r.ciLow, r.ciHigh])
    .filter((v): v is number => v != null)
  if (ys.length === 0) return [0, 100]
  const lo = Math.max(0, Math.floor(Math.min(...ys) / 5) * 5)
  const hi = Math.min(100, Math.ceil(Math.max(...ys) / 5) * 5)
  return lo < hi ? [lo, hi] : [Math.max(0, lo - 5), Math.min(100, hi + 5)]
}

type ClockChartRow = {
  bucket: string
  optimality: number | null
  ciLow: number | null
  ciHigh: number | null
  n: number
}

function ClockTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { payload: ClockChartRow }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label}</div>
      <div>
        {row.optimality === null ? '—' : `${row.optimality.toFixed(1)}%`}
        {row.ciLow !== null && row.ciHigh !== null
          ? ` · 95% CI ${row.ciLow.toFixed(1)}–${row.ciHigh.toFixed(1)}%`
          : ''}
      </div>
      <div className={styles.tooltipN}>n={row.n}</div>
    </div>
  )
}
