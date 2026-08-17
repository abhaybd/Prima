import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { DEFAULT_CONFIG, type Config } from '../types/config'
import { loadConfig, saveConfig } from '../store/config'
import { downloadText, exportDatabase, importDatabase } from '../store/export'
import styles from './SettingsView.module.css'

function playPagePrefs(live: Config) {
  return {
    userColor: live.userColor,
    timeControl: { ...live.timeControl },
    opponentElo: live.opponentElo,
  }
}

function Field({
  label,
  tip,
  children,
}: {
  label: string
  tip: string
  children: ReactNode
}) {
  return (
    <label title={tip}>
      <span className={styles.labelRow}>
        {label}
        <span className={styles.tipMark} aria-hidden="true">
          ?
        </span>
      </span>
      {children}
    </label>
  )
}

export function SettingsView() {
  const [config, setConfig] = useState<Config>(() => loadConfig())
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setConfig(loadConfig())
  }, [])

  function patch<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((c) => ({ ...c, [key]: value }))
    setSaved(false)
  }

  function onSave() {
    const next = { ...config, ...playPagePrefs(loadConfig()) }
    saveConfig(next)
    setConfig(next)
    setSaved(true)
    setMessage('Saved')
  }

  async function onExport() {
    const json = await exportDatabase()
    downloadText(`blitzdrill-${new Date().toISOString().slice(0, 10)}.json`, json)
  }

  async function onImport(file: File) {
    try {
      await importDatabase(await file.text())
      setConfig(loadConfig())
      setMessage('Imported')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Import failed')
    }
  }

  return (
    <div className={styles.page}>
      <h1>Settings</h1>
      <p className="hint">Stored in this browser only. Hover the ? for details.</p>

      <section className="panel">
        <h2>Difficulty</h2>
        <div className={styles.grid}>
          <Field
            label="Threshold Elo"
            tip="Rating band your moves are scored against. Set it above the bot. This is not the bot's rating."
          >
            <input
              type="number"
              value={config.thresholdElo}
              onChange={(e) => patch('thresholdElo', Number(e.target.value))}
            />
          </Field>
          <Field
            label="Policy ratio τ"
            tip="Freeze if Maia thinks your move is weaker than this fraction of its top choice. Lower is more permissive."
          >
            <input
              type="number"
              step="0.01"
              value={config.tauRatio}
              onChange={(e) => patch('tauRatio', Number(e.target.value))}
            />
          </Field>
          <Field
            label="WDL Δ τ"
            tip="Freeze if Stockfish expected score drops more than this versus its best move. Leave loose; tightening it trains engine accuracy instead of blitz."
          >
            <input
              type="number"
              step="0.01"
              value={config.tauWdl}
              onChange={(e) => patch('tauWdl', Number(e.target.value))}
            />
          </Field>
          <Field
            label="Stockfish WDL clause"
            tip="Optional second freeze check using Stockfish. Turn off if it almost never fires on its own."
          >
            <select
              value={config.wdlClauseEnabled ? 'on' : 'off'}
              onChange={(e) => patch('wdlClauseEnabled', e.target.value === 'on')}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </Field>
          <Field
            label="Stockfish movetime (ms)"
            tip="How long Stockfish thinks per search. Each evaluated move runs two searches."
          >
            <input
              type="number"
              value={config.sfMovetimeMs}
              onChange={(e) => patch('sfMovetimeMs', Number(e.target.value))}
            />
          </Field>
          <Field
            label="Maia model"
            tip="Which Maia-3 network plays as the bot and scores your moves. 23M is default; 5M downloads less."
          >
            <select
              value={config.maiaVariant}
              onChange={(e) => patch('maiaVariant', e.target.value as Config['maiaVariant'])}
            >
              <option value="23m">23M (default)</option>
              <option value="5m">5M (low bandwidth)</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="panel">
        <h2>Freeze behavior</h2>
        <div className={styles.grid}>
          <Field
            label="Max retries"
            tip="After this many failed attempts in a freeze, the engine move is revealed and played."
          >
            <input
              type="number"
              value={config.maxRetries}
              onChange={(e) => patch('maxRetries', Number(e.target.value))}
            />
          </Field>
          <Field
            label="Decoy freeze rate"
            tip="Chance of freezing a move that already passed, so a freeze is not a free hint that the move was wrong."
          >
            <input
              type="number"
              step="0.01"
              value={config.decoyFreezeRate}
              onChange={(e) => patch('decoyFreezeRate', Number(e.target.value))}
            />
          </Field>
          <Field
            label="Verdict gate (ms)"
            tip="Minimum delay before showing freeze or pass, so how long the engines took cannot leak the answer."
          >
            <input
              type="number"
              value={config.verdictGateMs}
              onChange={(e) => patch('verdictGateMs', Number(e.target.value))}
            />
          </Field>
          <div className={styles.clockGroup}>
            <Field
              label="Clock during freeze"
              tip="Pause + penalty stops the clock then deducts time. Keep running is closest to real blitz. Pause only stops the clock. Pause, then run gives a short pause before the clock starts again."
            >
              <select
                value={config.freezeClockMode}
                onChange={(e) =>
                  patch('freezeClockMode', e.target.value as Config['freezeClockMode'])
                }
              >
                <option value="penalty">Pause + penalty</option>
                <option value="running">Keep running</option>
                <option value="paused">Pause only</option>
                <option value="grace">Pause, then run</option>
              </select>
            </Field>
            {config.freezeClockMode === 'penalty' ? (
              <Field
                label="Penalty seconds"
                tip="Seconds deducted from your clock when a freeze is resolved."
              >
                <input
                  type="number"
                  value={config.freezePenaltySeconds}
                  onChange={(e) => patch('freezePenaltySeconds', Number(e.target.value))}
                />
              </Field>
            ) : null}
            {config.freezeClockMode === 'grace' ? (
              <Field
                label="Grace seconds"
                tip="How long the clock stays paused. After this, it runs if you are still frozen. A passing move during the pause ends the freeze immediately."
              >
                <input
                  type="number"
                  value={config.freezeGraceSeconds}
                  onChange={(e) => patch('freezeGraceSeconds', Number(e.target.value))}
                />
              </Field>
            ) : null}
          </div>
        </div>
      </section>

      <div className={styles.actions}>
        <button type="button" onClick={onSave} title="Save these settings to this browser.">
          Save
        </button>
        <button
          type="button"
          className="secondary"
          title="Restore difficulty and freeze defaults. Color, time control, and bot Elo on the play page are left as they are."
          onClick={() => {
            setConfig({
              ...DEFAULT_CONFIG,
              ...playPagePrefs(loadConfig()),
            })
            setSaved(false)
          }}
        >
          Reset defaults
        </button>
        <button
          type="button"
          className="secondary"
          title="Download settings, games, and move data as JSON."
          onClick={() => void onExport()}
        >
          Export data
        </button>
        <label
          className={styles.importBtn}
          title="Replace settings and stored games from a previously exported JSON file."
        >
          Import data
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onImport(file)
            }}
          />
        </label>
        {saved || message ? <span className="hint">{message}</span> : null}
      </div>
    </div>
  )
}
