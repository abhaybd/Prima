import { useEffect, useState } from 'react'
import {
  debugVerdict,
  plyLabel,
  type DebugGameMeta,
  type DebugVerdict,
} from '../lib/debug'
import type { EvalComment } from '../lib/pgn'
import type { Wdl } from '../lib/wdl'
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
  const tauWdl = current?.tauWdl ?? meta?.tauWdl
  const wdlOn = current?.wdlClauseEnabled ?? meta?.wdlOn ?? false

  return (
    <section className={`panel ${styles.panel}`}>
      <header className={styles.head}>
        <h3>Debug</h3>
        {meta ? (
          <ul className={styles.chips}>
            <li>{meta.userColor === 'w' ? 'White' : 'Black'}</li>
            <li>Bot {meta.opponentElo}</li>
            <li>Threshold {meta.thresholdElo}</li>
            <li>τ_ratio {meta.tauRatio.toFixed(2)}</li>
            <li>τ_wdl {meta.wdlOn ? meta.tauWdl.toFixed(2) : 'off'}</li>
            <li>Book {meta.bookSize}</li>
          </ul>
        ) : (
          <p className="hint">Start a game to stream channel A/B on each of your moves.</p>
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
          <EvalDetail
            d={current}
            tauRatio={tauRatio}
            tauWdl={tauWdl}
            wdlOn={wdlOn}
          />
          <History evals={evals} selected={selected} onSelect={setSelected} />
        </div>
      ) : (
        <p className="hint">No user moves evaluated yet.</p>
      )}
    </section>
  )
}

function EvalDetail({
  d,
  tauRatio,
  tauWdl,
  wdlOn,
}: {
  d: EvalComment
  tauRatio: number | undefined
  tauWdl: number | undefined
  wdlOn: boolean
}) {
  const verdict = debugVerdict(d)
  const ratioFire = d.trigger === 'ratio' || d.trigger === 'both'
  const wdlFire = d.trigger === 'wdl' || d.trigger === 'both'
  const eDrop =
    d.eBest !== undefined && d.eAfter !== undefined ? d.eBest - d.eAfter : d.wdlDelta

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
        <ChannelLight letter="A" label="Policy ratio" fired={ratioFire} skipped={!!d.skipReason} />
        <ChannelLight
          letter="B"
          label="WDL drop"
          fired={wdlFire}
          skipped={!!d.skipReason || !wdlOn}
          off={!wdlOn}
        />
      </div>

      <Meter
        label="Channel A · P(move) / P(top)"
        value={d.ratio}
        tau={tauRatio}
        passIf="gte-tau"
        format={(n) => n.toFixed(3)}
        empty={d.skipReason ? 'skipped' : undefined}
      />
      <Meter
        label="Channel B · WDL Δ (user POV)"
        value={d.wdlDelta}
        tau={tauWdl}
        passIf="lte-tau"
        format={(n) => n.toFixed(3)}
        disabled={!wdlOn}
        empty={d.skipReason ? 'skipped' : undefined}
      />

      {d.pMove !== undefined || d.pTop !== undefined ? (
        <div className={styles.policy}>
          <BarRow label="P(move)" value={d.pMove} max={Math.max(d.pTop ?? 0, d.pMove ?? 0, 0.01)} />
          <BarRow label="P(top)" value={d.pTop} max={Math.max(d.pTop ?? 0, d.pMove ?? 0, 0.01)} />
        </div>
      ) : null}

      {eDrop !== undefined || d.eBest !== undefined ? (
        <div className={styles.expected}>
          <span className="statLabel">E user POV</span>
          <span>
            {fmtOpt(d.eBest, 3)}
            <span className={styles.arrow}>→</span>
            {fmtOpt(d.eAfter, 3)}
          </span>
          <span className={eDrop !== undefined && eDrop > (tauWdl ?? 0) ? styles.bad : styles.ok}>
            Δ {fmtOpt(eDrop, 3)}
          </span>
        </div>
      ) : null}

      {d.wdlStm || d.wdlAfterStm ? (
        <div className={styles.wdlBlock}>
          {d.wdlStm ? <WdlRow label="Before (you STM)" wdl={d.wdlStm} /> : null}
          {d.wdlAfterStm ? <WdlRow label="After (opp STM)" wdl={d.wdlAfterStm} /> : null}
        </div>
      ) : null}

      <dl className={styles.compare}>
        <div>
          <dt>You</dt>
          <dd>{d.uci}</dd>
        </div>
        <div>
          <dt>Maia top</dt>
          <dd>{d.thresholdTopMove || '—'}</dd>
        </div>
        <div>
          <dt>SF best</dt>
          <dd>{d.sfBestMove || '—'}</dd>
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
  off,
}: {
  letter: string
  label: string
  fired: boolean
  skipped: boolean
  off?: boolean
}) {
  const tone = off || skipped ? 'idle' : fired ? 'fired' : 'ok'
  return (
    <div className={`${styles.light} ${styles[tone]}`}>
      <span className={styles.dot} />
      <span>
        <strong>{letter}</strong> {label}
        {off ? ' · off' : skipped ? ' · skip' : fired ? ' · fire' : ' · ok'}
      </span>
    </div>
  )
}

function Meter({
  label,
  value,
  tau,
  passIf,
  format,
  disabled,
  empty,
}: {
  label: string
  value: number | undefined
  tau: number | undefined
  passIf: 'gte-tau' | 'lte-tau'
  format: (n: number) => string
  disabled?: boolean
  empty?: string
}) {
  if (disabled) {
    return (
      <div className={styles.meter}>
        <div className={styles.meterLabel}>{label}</div>
        <p className="hint">Clause off</p>
      </div>
    )
  }
  if (empty || value === undefined || tau === undefined) {
    return (
      <div className={styles.meter}>
        <div className={styles.meterLabel}>{label}</div>
        <p className="hint">{empty ?? '—'}</p>
      </div>
    )
  }
  const pass = passIf === 'gte-tau' ? value >= tau : value <= tau
  const domain =
    passIf === 'gte-tau' ? 1 : Math.max(tau * 2, value * 1.15, 0.2)
  const valuePct = clamp((value / domain) * 100)
  const tauPct = clamp((tau / domain) * 100)
  const fail =
    passIf === 'gte-tau'
      ? { left: 0, width: tauPct }
      : { left: tauPct, width: 100 - tauPct }

  return (
    <div className={styles.meter}>
      <div className={styles.meterLabel}>
        <span>{label}</span>
        <span className={pass ? styles.ok : styles.bad}>
          {format(value)} <span className={styles.tau}>τ {format(tau)}</span>
        </span>
      </div>
      <div className={styles.track} title={`${format(value)} vs τ ${format(tau)}`}>
        <span className={styles.failZone} style={{ left: `${fail.left}%`, width: `${fail.width}%` }} />
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

function WdlRow({ label, wdl }: { label: string; wdl: Wdl }) {
  const total = Math.max(1, wdl.w + wdl.d + wdl.l)
  return (
    <div className={styles.wdlRow}>
      <span>{label}</span>
      <div className={styles.wdlBar}>
        <span className={styles.w} style={{ flexGrow: wdl.w / total }} />
        <span className={styles.d} style={{ flexGrow: wdl.d / total }} />
        <span className={styles.l} style={{ flexGrow: wdl.l / total }} />
      </div>
      <span className={styles.wdlNums}>
        {wdl.w}/{wdl.d}/{wdl.l}
      </span>
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
                  : `r ${d.ratio?.toFixed(2) ?? '—'}  Δ ${d.wdlDelta?.toFixed(2) ?? '—'}`}
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

function fmtOpt(n: number | undefined, digits: number): string {
  return n === undefined ? '—' : n.toFixed(digits)
}
