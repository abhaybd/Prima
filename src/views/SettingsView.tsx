import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_CONFIG, type Config } from '../types/config'
import { loadConfig, saveConfig } from '../store/config'
import { clearStoredData, downloadText, exportDatabase, importDatabase } from '../store/export'
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
  const importRef = useRef<HTMLInputElement>(null)

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
    downloadText(`prima-${new Date().toISOString().slice(0, 10)}.json`, json)
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

  async function onClearData() {
    const confirmed = window.confirm(
      'This will delete all settings, games, and move history from this browser. This cannot be undone.',
    )
    if (!confirmed) return
    try {
      await clearStoredData()
      setConfig(loadConfig())
      setSaved(false)
      setMessage('All stored data cleared')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Clear failed')
    }
  }

  return (
    <div className={styles.page}>
      <h1>Settings</h1>
      <p className="hint">Stored in this browser only. Hover the ? for details.</p>

      <section className="panel">
        <h2>Opponent</h2>
        <div className={styles.grid}>
          <Field
            label="Maia model"
            tip="Which Maia-3 network plays as the bot and as the expert scoring your moves. 23M is default; 5M downloads less."
          >
            <select
              value={config.maiaVariant}
              onChange={(e) => patch('maiaVariant', e.target.value as Config['maiaVariant'])}
            >
              <option value="23m">23M (default)</option>
              <option value="5m">5M (low bandwidth)</option>
            </select>
          </Field>
          <Field
            label="Move sampling"
            tip="How the bot chooses a move. Nucleus picks from a short list of likely human moves, so it still varies. Always the top move plays the same favorite every time."
          >
            <select
              value={config.opponentSampleMode}
              onChange={(e) =>
                patch('opponentSampleMode', e.target.value as Config['opponentSampleMode'])
              }
            >
              <option value="nucleus">Nucleus (top-p)</option>
              <option value="argmax">Argmax (top move)</option>
            </select>
          </Field>
          {config.opponentSampleMode === 'nucleus' ? (
            <Field
              label="Nucleus p"
              tip="How long that short list is. 0.9 is the default and stays with normal human choices. Raise it toward 1.0 to allow rarer — and sometimes terrible — moves."
            >
              <input
                type="number"
                step="0.05"
                min={0.05}
                max={1}
                value={config.opponentTopP}
                onChange={(e) => patch('opponentTopP', Number(e.target.value))}
              />
            </Field>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2>Difficulty</h2>
        <div className={styles.grid}>
          <Field
            label="Expert Elo"
            tip="Rating the expert uses when scoring your moves. Set it above the bot. This is not the bot's rating."
          >
            <input
              type="number"
              value={config.thresholdElo}
              onChange={(e) => patch('thresholdElo', Number(e.target.value))}
            />
          </Field>
          <Field
            label="Min optimality (%)"
            tip="Freeze if the expert rates your move below this percent of its top choice. Lower is more permissive."
          >
            <input
              type="number"
              step="1"
              min={0}
              max={100}
              value={Number((config.tauRatio * 100).toFixed(1))}
              onChange={(e) => patch('tauRatio', Number(e.target.value) / 100)}
            />
          </Field>
        </div>
      </section>

      <section className="panel">
        <h2>Freeze behavior</h2>
        <div className={styles.grid}>
          <Field
            label="Max retries"
            tip="After this many failed attempts in a freeze, the expert's top move is shown as an arrow. You can play any move."
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
        </div>
        <div className={styles.grid}>
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
      </section>

      <div className={styles.actions}>
        <button type="button" onClick={onSave} title="Save these settings to this browser.">
          Save
        </button>
        <button
          type="button"
          className="secondary"
          title="Restore opponent, difficulty, and freeze defaults. Color, time control, and bot Elo on the play page are left as they are."
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
        <button
          type="button"
          className="secondary"
          title="Replace settings and stored games from a previously exported JSON file."
          onClick={() => importRef.current?.click()}
        >
          Import data
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void onImport(file)
            e.target.value = ''
          }}
        />
        {saved || message ? <span className="hint">{message}</span> : null}
      </div>

      <div className={styles.dangerZone}>
        <button
          type="button"
          className="danger"
          title="Delete settings, games, and move history from this browser."
          onClick={() => void onClearData()}
        >
          Clear data
        </button>
        <span className="hint">Deletes settings, games, and move history from this browser.</span>
      </div>
    </div>
  )
}
