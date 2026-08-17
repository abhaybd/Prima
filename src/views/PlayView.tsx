import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Board } from '../components/Board'
import { Clocks } from '../components/Clocks'
import { DebugPanel } from '../components/DebugPanel'
import { FreezeOverlay } from '../components/FreezeOverlay'
import { MoveList } from '../components/MoveList'
import { useGame } from '../game/useGame'
import { debugHref, useDebugMode } from '../lib/debug'
import { loadConfig, mergeConfig, saveConfig } from '../store/config'
import type { TimeControl, UserColorPref } from '../types/config'
import styles from './PlayView.module.css'

type PlayPrefs = {
  userColor: UserColorPref
  timeControl: TimeControl
  opponentElo: number
}

function loadPlayPrefs(): PlayPrefs {
  const config = loadConfig()
  return {
    userColor: config.userColor,
    timeControl: { ...config.timeControl },
    opponentElo: config.opponentElo,
  }
}

function persistPlayPrefs(prefs: PlayPrefs): PlayPrefs {
  const next = mergeConfig(loadConfig(), prefs)
  saveConfig(next)
  return {
    userColor: next.userColor,
    timeControl: { ...next.timeControl },
    opponentElo: next.opponentElo,
  }
}

function colorLabel(color: 'w' | 'b' | 'random'): string {
  if (color === 'w') return 'White'
  if (color === 'b') return 'Black'
  return 'Random'
}

function formatTimeControl(tc: TimeControl): string {
  const minutes = tc.initial / 60
  const initial =
    Number.isInteger(minutes) ? `${minutes}` : `${tc.initial}s`
  return `${initial}+${tc.increment}`
}

const TIME_PRESETS: { label: string; timeControl: TimeControl }[] = [
  { label: '3+0', timeControl: { initial: 180, increment: 0 } },
  { label: '3+1', timeControl: { initial: 180, increment: 1 } },
  { label: '5+0', timeControl: { initial: 300, increment: 0 } },
]

function matchingTimePreset(tc: TimeControl): string {
  const match = TIME_PRESETS.find(
    (p) => p.timeControl.initial === tc.initial && p.timeControl.increment === tc.increment,
  )
  return match?.label ?? 'custom'
}

export function PlayView() {
  const { state, startGame, onDrop } = useGame()
  const debug = useDebugMode()
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<PlayPrefs>(loadPlayPrefs)
  const interactive =
    (state.status === 'playing' || state.status === 'frozen') && !state.freeze?.revealed
  const hasGame = state.status !== 'idle' || state.gameId !== null

  function openNewGameDialog() {
    setDraft(loadPlayPrefs())
    dialogRef.current?.showModal()
  }

  function closeNewGameDialog() {
    dialogRef.current?.close()
  }

  function startFromDialog() {
    persistPlayPrefs(draft)
    closeNewGameDialog()
    void startGame()
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close()
    }
    dialog.addEventListener('click', onClick)
    return () => dialog.removeEventListener('click', onClick)
  }, [])

  return (
    <div className={styles.layout}>
      <div className={styles.boardCol}>
        <div
          className={`${styles.boardFrame}${
            state.status === 'frozen' ? ` ${styles.frozenFrame}` : ''
          }${state.timedOut ? ` ${styles.flaggedFrame}` : ''}`}
        >
          {state.timedOut ? (
            <div className={styles.timeoutBanner}>
              <div className={styles.timeoutTitle}>Ran out of time</div>
            </div>
          ) : null}
          {state.status === 'frozen' && state.freeze && !state.freeze.revealed ? (
            <FreezeOverlay retries={state.freeze.retries} maxRetries={state.freeze.maxRetries} />
          ) : null}
          <Board
            fen={state.fen}
            orientation={state.userColor === 'w' ? 'white' : 'black'}
            interactive={interactive}
            onMove={onDrop}
          />
        </div>
      </div>
      <aside className={`panel ${styles.side}`}>
        <div className={styles.toolbar}>
          <button
            type="button"
            onClick={openNewGameDialog}
            disabled={state.status === 'loading'}
          >
            New game
          </button>
          {state.status === 'gameover' && state.gameId ? (
            <button
              type="button"
              className="secondary"
              onClick={() => navigate(debugHref(`/report/${state.gameId}`, debug))}
            >
              View report
            </button>
          ) : null}
        </div>
        {hasGame ? (
          <div className={styles.gameSetup}>
            <div>
              <div className="statLabel">You</div>
              <div>{colorLabel(state.userColor)}</div>
            </div>
            <div>
              <div className="statLabel">Bot</div>
              <div>{state.opponentElo}</div>
            </div>
            <div>
              <div className="statLabel">Time control</div>
              <div>{formatTimeControl(state.timeControl)}</div>
            </div>
          </div>
        ) : null}
        {state.status === 'loading' && state.loadProgress ? (
          <div>
            <p>{state.loadProgress.label}</p>
            <progress
              max={state.loadProgress.total || 1}
              value={state.loadProgress.loaded}
            />
          </div>
        ) : null}
        {state.error ? <p className="error">{state.error}</p> : null}
        <Clocks clocks={state.clocks} userColor={state.userColor} />
        <div className={styles.meta}>
          <div>
            <div className="stat">{state.freezeCount}</div>
            <div className="statLabel">Freezes</div>
          </div>
          <div>
            <div className="stat">
              {state.status === 'gameover'
                ? state.timedOut
                  ? 'out of time'
                  : state.lastResult
                : state.status}
            </div>
            <div className="statLabel">Status</div>
          </div>
        </div>
        {state.freeze?.revealed ? (
          <p className="hint">
            Revealed {state.freeze.revealed.sfBest} (engine) / {state.freeze.revealed.thresholdTop}{' '}
            (threshold)
          </p>
        ) : null}
        <h3>Moves</h3>
        <MoveList sans={state.sanMoves} />
      </aside>
      {debug ? (
        <DebugPanel meta={state.debugMeta} evals={state.debugEvals} notes={state.debugNotes} />
      ) : null}

      <dialog ref={dialogRef} className={styles.dialog}>
        <form
          className={styles.dialogForm}
          onSubmit={(event) => {
            event.preventDefault()
            startFromDialog()
          }}
        >
          <h2>New game</h2>
          <div className={styles.dialogGrid}>
            <label title="Which side you play.">
              Color
              <select
                value={draft.userColor}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, userColor: e.target.value as UserColorPref }))
                }
              >
                <option value="w">White</option>
                <option value="b">Black</option>
                <option value="random">Random</option>
              </select>
            </label>
            <label title="Bot strength. Maia uses this rating for both players when the bot moves.">
              Bot Elo
              <input
                type="number"
                min={500}
                max={4000}
                value={draft.opponentElo}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, opponentElo: Number(e.target.value) }))
                }
              />
            </label>
          </div>
          <div className={styles.dialogTime}>
            <div className={styles.dialogTimeLabel}>Time control</div>
            <label title="Common blitz controls. Choose Custom values with the fields below.">
              Preset
              <select
                value={matchingTimePreset(draft.timeControl)}
                onChange={(e) => {
                  const preset = TIME_PRESETS.find((p) => p.label === e.target.value)
                  if (!preset) return
                  setDraft((d) => ({ ...d, timeControl: { ...preset.timeControl } }))
                }}
              >
                {TIME_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
                {matchingTimePreset(draft.timeControl) === 'custom' ? (
                  <option value="custom">Custom</option>
                ) : null}
              </select>
            </label>
            <div className={styles.dialogGrid}>
              <label title="Your starting clock, in seconds.">
                Initial (seconds)
                <input
                  type="number"
                  min={1}
                  value={draft.timeControl.initial}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      timeControl: { ...d.timeControl, initial: Number(e.target.value) },
                    }))
                  }
                />
              </label>
              <label title="Seconds added to your clock after each of your moves.">
                Increment
                <input
                  type="number"
                  min={0}
                  value={draft.timeControl.increment}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      timeControl: { ...d.timeControl, increment: Number(e.target.value) },
                    }))
                  }
                />
              </label>
            </div>
          </div>
          <div className={styles.dialogActions}>
            <button type="submit">Start game</button>
            <button type="button" className="secondary" onClick={closeNewGameDialog}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
