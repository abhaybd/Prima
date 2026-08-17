import { useEffect, useState } from 'react'
import {
  debugVerdict,
  plyLabel,
  type DebugGameMeta,
  type DebugVerdict,
} from '../lib/debug'
import type { EvalComment } from '../lib/pgn'
import styles from './DebugPanel.module.css'

interface Props {
  meta: DebugGameMeta | null
  evals: EvalComment[]
  notes: string[]
}

const VERDICT_LABEL: Record<DebugVerdict, string> = {
  pass: 'Pass',
  freeze: 'Freeze',
  decoy: 'Decoy',
  skip: 'Skip',
}

export function DebugPanel({ meta, evals, notes }: Props) {
  const [selected, setSelected] = useState(Math.max(0, evals.length - 1))

  useEffect(() => {
    setSelected(Math.max(0, evals.length - 1))
  }, [evals.length])

  const current = evals[selected]
  const tauRatio = current?.tauRatio ?? meta?.tauRatio

  return (
    <section className={`panel ${styles.panel}`}>
      <header className={styles.head}>
        <h3>Debug</h3>
        {meta ? (
          <ul className={styles.chips}>
            <li>{meta.userColor === 'w' ? 'White' : 'Black'}</li>
            <li>Bot {meta.opponentElo}</li>
            <li>Expert {meta.thresholdElo}</li>
            <li>min opt {(meta.tauRatio * 100).toFixed(0)}%</li>
            <li>Book {meta.bookSize}</li>
          </ul>
        ) : (
          <p className="hint">Start a game to stream optimality on each of your moves.</p>
        )}
      </header>
      {notes.length ? (
        <ul className={styles.notes}>
          {notes.map((note, i) => (
            <li key={`${i}-${note}`}>{note}</li>
          ))}
        </ul>
      ) : null}
      {current ? (
        <div className={styles.body}>
          <EvalDetail d={current} tauRatio={tauRatio} />
          <History evals={evals} selected={selected} onSelect={setSelected} />
        </div>
      ) : (
        <p className="hint">No user moves evaluated yet.</p>
      )}
    </section>
  )
}

function EvalDetail({ d, tauRatio }: { d: EvalComment; tauRatio: number | undefined }) {
  const verdict = debugVerdict(d)
  const ratioFire = d.trigger === 'ratio' || d.trigger === 'both'

  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <div>
          <div className={styles.move}>
            <span className={styles.ply}>{plyLabel(d.ply)}</span>
            {d.uci}
          </div>
          <div className={styles.sub}>
            ply {d.ply}
            {d.skipReason ? ` · skip ${d.skipReason}` : null}
            {d.resolved ? ` · ${d.resolved}` : d.freeze ? ' · waiting retry' : null}
            {d.retries ? ` · ${d.retries} ${d.retries === 1 ? 'retry' : 'retries'}` : null}
          </div>
        </div>
        <span className={`${styles.badge} ${styles[verdict]}`}>{VERDICT_LABEL[verdict]}</span>
      </div>

      <div className={styles.channels}>
        <ChannelLight letter="A" label="Optimality" fired={ratioFire} skipped={!!d.skipReason} />
      </div>

      <Meter
        label="Optimality"
        value={d.ratio}
        tau={tauRatio}
        format={(n) => `${(n * 100).toFixed(0)}%`}
        empty={d.skipReason ? 'skipped' : undefined}
      />

      {d.pMove !== undefined || d.pTop !== undefined ? (
        <div className={styles.policy}>
          <BarRow label="P(move)" value={d.pMove} max={Math.max(d.pTop ?? 0, d.pMove ?? 0, 0.01)} />
          <BarRow label="P(expert top)" value={d.pTop} max={Math.max(d.pTop ?? 0, d.pMove ?? 0, 0.01)} />
        </div>
      ) : null}

      <dl className={styles.compare}>
        <div>
          <dt>You</dt>
          <dd>{d.uci}</dd>
        </div>
        <div>
          <dt>Expert top</dt>
          <dd>{d.thresholdTopMove || '—'}</dd>
        </div>
      </dl>
      {d.attempts && d.attempts.length > 1 ? (
        <p className={styles.attempts}>Attempts {d.attempts.join(' → ')}</p>
      ) : null}
    </div>
  )
}

function ChannelLight({
  letter,
  label,
  fired,
  skipped,
}: {
  letter: string
  label: string
  fired: boolean
  skipped: boolean
}) {
  const tone = skipped ? 'idle' : fired ? 'fired' : 'ok'
  return (
    <div className={`${styles.light} ${styles[tone]}`}>
      <span className={styles.dot} />
      <span>
        <strong>{letter}</strong> {label}
        {skipped ? ' · skip' : fired ? ' · fire' : ' · ok'}
      </span>
    </div>
  )
}

function Meter({
  label,
  value,
  tau,
  format,
  empty,
}: {
  label: string
  value: number | undefined
  tau: number | undefined
  format: (n: number) => string
  empty?: string
}) {
  if (empty || value === undefined || tau === undefined) {
    return (
      <div className={styles.meter}>
        <div className={styles.meterLabel}>{label}</div>
        <p className="hint">{empty ?? '—'}</p>
      </div>
    )
  }
  const pass = value >= tau
  const valuePct = clamp(value * 100)
  const tauPct = clamp(tau * 100)

  return (
    <div className={styles.meter}>
      <div className={styles.meterLabel}>
        <span>{label}</span>
        <span className={pass ? styles.ok : styles.bad}>
          {format(value)} <span className={styles.tau}>τ {format(tau)}</span>
        </span>
      </div>
      <div className={styles.track} title={`${format(value)} vs τ ${format(tau)}`}>
        <span className={styles.failZone} style={{ left: 0, width: `${tauPct}%` }} />
        <span className={`${styles.fill} ${pass ? styles.fillOk : styles.fillBad}`} style={{ width: `${valuePct}%` }} />
        <span className={styles.tick} style={{ left: `${tauPct}%` }} />
      </div>
    </div>
  )
}

function BarRow({ label, value, max }: { label: string; value: number | undefined; max: number }) {
  const n = value ?? 0
  return (
    <div className={styles.barRow}>
      <span>{label}</span>
      <div className={styles.track}>
        <span className={`${styles.fill} ${styles.fillMute}`} style={{ width: `${clamp((n / max) * 100)}%` }} />
      </div>
      <span className={styles.barVal}>{value === undefined ? '—' : `${(value * 100).toFixed(1)}%`}</span>
    </div>
  )
}

function History({
  evals,
  selected,
  onSelect,
}: {
  evals: EvalComment[]
  selected: number
  onSelect: (i: number) => void
}) {
  const rows = [...evals.entries()].reverse()
  return (
    <div className={styles.history}>
      <div className="statLabel">History</div>
      <div className={styles.histList}>
        {rows.map(([i, d]) => {
          const verdict = debugVerdict(d)
          return (
            <button
              key={i}
              type="button"
              className={`${styles.histRow} ${i === selected ? styles.histSel : ''}`}
              onClick={() => onSelect(i)}
            >
              <span className={styles.histMove}>
                {plyLabel(d.ply)} {d.uci}
              </span>
              <span className={`${styles.histTag} ${styles[verdict]}`}>{VERDICT_LABEL[verdict]}</span>
              <span className={styles.histNums}>
                {d.skipReason
                  ? d.skipReason
                  : `opt ${d.ratio !== undefined ? `${(d.ratio * 100).toFixed(0)}%` : '—'}`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n))
}
