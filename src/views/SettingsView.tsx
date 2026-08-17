import { useEffect, useState } from 'react'
import { DEFAULT_CONFIG, type Config } from '../types/config'
import { loadConfig, saveConfig } from '../store/config'
import { downloadText, exportDatabase, importDatabase } from '../store/export'
import styles from './SettingsView.module.css'

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
    saveConfig(config)
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
      <p className="hint">Stored in this browser only.</p>

      <section className="panel">
        <h2>Opponent</h2>
        <div className={styles.grid}>
          <label>
            Your Elo
            <input
              type="number"
              value={config.userElo}
              onChange={(e) => patch('userElo', Number(e.target.value))}
            />
          </label>
          <label>
            Opponent Elo
            <input
              type="number"
              value={config.opponentElo}
              onChange={(e) => patch('opponentElo', Number(e.target.value))}
            />
          </label>
          <label>
            Your color
            <select
              value={config.userColor}
              onChange={(e) => patch('userColor', e.target.value as Config['userColor'])}
            >
              <option value="w">White</option>
              <option value="b">Black</option>
              <option value="random">Random</option>
            </select>
          </label>
          <label>
            Maia model
            <select
              value={config.maiaVariant}
              onChange={(e) => patch('maiaVariant', e.target.value as Config['maiaVariant'])}
            >
              <option value="23m">23M (default)</option>
              <option value="5m">5M (low bandwidth)</option>
            </select>
          </label>
        </div>
        <p className="hint">Opponent Elo is the bot&apos;s strength. Your Elo is how the bot models you.</p>
      </section>

      <section className="panel">
        <h2>Difficulty</h2>
        <div className={styles.grid}>
          <label>
            Threshold Elo
            <input
              type="number"
              value={config.thresholdElo}
              onChange={(e) => patch('thresholdElo', Number(e.target.value))}
            />
          </label>
          <label>
            Policy ratio τ
            <input
              type="number"
              step="0.01"
              value={config.tauRatio}
              onChange={(e) => patch('tauRatio', Number(e.target.value))}
            />
          </label>
          <label>
            WDL Δ τ
            <input
              type="number"
              step="0.01"
              value={config.tauWdl}
              onChange={(e) => patch('tauWdl', Number(e.target.value))}
            />
          </label>
          <label>
            Stockfish WDL clause
            <select
              value={config.wdlClauseEnabled ? 'on' : 'off'}
              onChange={(e) => patch('wdlClauseEnabled', e.target.value === 'on')}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
        </div>
        <p className="hint">
          Threshold Elo is not the bot&apos;s rating. It is the bar your moves are scored against — set it
          above your Elo.
        </p>
      </section>

      <section className="panel">
        <h2>Freeze behavior</h2>
        <div className={styles.grid}>
          <label>
            Max retries
            <input
              type="number"
              value={config.maxRetries}
              onChange={(e) => patch('maxRetries', Number(e.target.value))}
            />
          </label>
          <label>
            Clock during freeze
            <select
              value={config.freezeClockMode}
              onChange={(e) =>
                patch('freezeClockMode', e.target.value as Config['freezeClockMode'])
              }
            >
              <option value="penalty">Pause + penalty</option>
              <option value="running">Keep running</option>
              <option value="paused">Pause only</option>
            </select>
          </label>
          <label>
            Penalty seconds
            <input
              type="number"
              value={config.freezePenaltySeconds}
              onChange={(e) => patch('freezePenaltySeconds', Number(e.target.value))}
            />
          </label>
          <label>
            Decoy freeze rate
            <input
              type="number"
              step="0.01"
              value={config.decoyFreezeRate}
              onChange={(e) => patch('decoyFreezeRate', Number(e.target.value))}
            />
          </label>
          <label>
            Verdict gate (ms)
            <input
              type="number"
              value={config.verdictGateMs}
              onChange={(e) => patch('verdictGateMs', Number(e.target.value))}
            />
          </label>
          <label>
            Opening skip (plies)
            <input
              type="number"
              value={config.openingSkipPlies}
              onChange={(e) => patch('openingSkipPlies', Number(e.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Time control</h2>
        <div className={styles.grid}>
          <label>
            Initial seconds
            <input
              type="number"
              value={config.timeControl.initial}
              onChange={(e) =>
                patch('timeControl', {
                  ...config.timeControl,
                  initial: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Increment seconds
            <input
              type="number"
              value={config.timeControl.increment}
              onChange={(e) =>
                patch('timeControl', {
                  ...config.timeControl,
                  increment: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Stockfish movetime (ms)
            <input
              type="number"
              value={config.sfMovetimeMs}
              onChange={(e) => patch('sfMovetimeMs', Number(e.target.value))}
            />
          </label>
        </div>
      </section>

      <div className={styles.actions}>
        <button type="button" onClick={onSave}>
          Save
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setConfig({ ...DEFAULT_CONFIG, timeControl: { ...DEFAULT_CONFIG.timeControl } })
            setSaved(false)
          }}
        >
          Reset defaults
        </button>
        <button type="button" className="secondary" onClick={() => void onExport()}>
          Export data
        </button>
        <label className={styles.importBtn}>
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
