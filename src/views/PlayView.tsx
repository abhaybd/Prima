import { useNavigate } from 'react-router-dom'
import { Board } from '../components/Board'
import { Clocks } from '../components/Clocks'
import { FreezeOverlay } from '../components/FreezeOverlay'
import { MoveList } from '../components/MoveList'
import { useGame } from '../game/useGame'
import styles from './PlayView.module.css'

export function PlayView() {
  const { state, startGame, onDrop } = useGame()
  const navigate = useNavigate()
  const interactive =
    (state.status === 'playing' || state.status === 'frozen') && !state.freeze?.revealed

  return (
    <div className={styles.layout}>
      <div className={styles.boardCol}>
        <div className={styles.boardFrame}>
          <Board
            fen={state.fen}
            orientation={state.userColor === 'w' ? 'white' : 'black'}
            interactive={interactive}
            onMove={onDrop}
          />
          {state.status === 'frozen' && state.freeze ? (
            <FreezeOverlay retries={state.freeze.retries} maxRetries={state.freeze.maxRetries} />
          ) : null}
        </div>
      </div>
      <aside className={`panel ${styles.side}`}>
        <div className={styles.toolbar}>
          <button type="button" onClick={() => void startGame()} disabled={state.status === 'loading'}>
            New game
          </button>
          {state.status === 'gameover' && state.gameId ? (
            <button
              type="button"
              className="secondary"
              onClick={() => navigate(`/report/${state.gameId}`)}
            >
              View report
            </button>
          ) : null}
        </div>
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
            <div className="stat">{state.status === 'gameover' ? state.lastResult : state.status}</div>
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
    </div>
  )
}
