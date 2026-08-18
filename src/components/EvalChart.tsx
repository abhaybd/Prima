import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { clampEvalForChart, formatEvalPawns, normalizeMate0Eval } from '../lib/sfEval'
import type { SfEvalPoint } from '../types/game'
import styles from './EvalChart.module.css'

interface Props {
  points: SfEvalPoint[]
  selectedPly: number | null
  onSelectPly?: (ply: number) => void
}

type ChartRow = {
  ply: number
  x: number
  pawns: number
  display: number
  mate?: number
}

export function EvalChart({ points, selectedPly, onSelectPly }: Props) {
  if (points.length === 0) return null

  const data: ChartRow[] = points.map((p) => {
    const ev = normalizeMate0Eval({ pawns: p.pawns, mate: p.mate }, p.ply)
    return {
      ply: p.ply,
      x: p.ply + 1,
      pawns: ev.pawns,
      display: clampEvalForChart(ev.pawns),
      mate: ev.mate,
    }
  })
  const peak = Math.max(1, ...data.map((d) => Math.abs(d.display)))
  const cap = Math.min(8, Math.max(1, Math.ceil(peak * 2) / 2))
  const domain: [number, number] = [-cap, cap]

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
          onClick={(state) => {
            const ply = (state?.activePayload?.[0]?.payload as ChartRow | undefined)?.ply
            if (ply !== undefined) onSelectPly?.(ply)
          }}
        >
          <CartesianGrid stroke="#212830" />
          <XAxis
            dataKey="x"
            stroke="#8b98a5"
            allowDecimals={false}
            label={{ value: 'ply', position: 'insideBottomRight', offset: -4, fill: '#8b98a5', fontSize: 12 }}
          />
          <YAxis
            stroke="#8b98a5"
            width={56}
            domain={domain}
            ticks={[-cap, 0, cap]}
            tickFormatter={(v: number) => (v > 0 ? `+${v}` : String(v))}
            label={{
              value: 'eval',
              angle: -90,
              position: 'insideLeft',
              style: { fill: '#8b98a5', fontSize: 12 },
            }}
          />
          <ReferenceLine y={0} stroke="#3d444d" />
          <Tooltip content={<EvalTooltip />} />
          <Line
            type="monotone"
            dataKey="display"
            stroke="#79b8ff"
            dot={<EvalDot selectedPly={selectedPly} />}
            activeDot={{ r: 5, stroke: '#79b8ff', fill: '#e6edf3' }}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function EvalDot({
  cx,
  cy,
  payload,
  selectedPly,
}: {
  cx?: number
  cy?: number
  payload?: ChartRow
  selectedPly: number | null
}) {
  if (cx == null || cy == null || !payload) return null
  const selected = payload.ply === selectedPly
  return (
    <circle
      cx={cx}
      cy={cy}
      r={selected ? 5 : 3}
      fill={selected ? '#f0c14b' : '#79b8ff'}
      stroke={selected ? '#e6edf3' : 'none'}
    />
  )
}

function EvalTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { payload: ChartRow }[]
  label?: number
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>Ply {label}</div>
      <div>{formatEvalPawns(row)}</div>
    </div>
  )
}
