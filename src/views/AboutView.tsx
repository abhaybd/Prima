import styles from './AboutView.module.css'

export function AboutView() {
  return (
    <div className={styles.page}>
      <h1>About</h1>
      <p className="hint">
        Prima is a chess trainer that runs in your browser. The name is short for{' '}
        <em>prima facie</em> — from first look — because the skill it trains is judging a position
        on sight: playing acceptably when the clock is running, not hunting for the engine-best
        move.
      </p>

      <section className="panel">
        <h2>The idea</h2>
        <p>
          You play blitz against a human-like{' '}
          <a href="https://github.com/CSSLab/maia3">Maia-3</a> bot. After each of your moves, the
          app checks whether a stronger human (the <em>expert</em>) would also play it, relative to
          their top choice. If that optimality is too low, the position <strong>freezes</strong>:
          the move is undone, a neutral overlay appears, and you try again.
        </p>
        <p>
          The bet is that strong blitz is not finding best moves quickly, but keeping unacceptable
          ones off the board while time is running out. What the app tracks, then, is freeze rate,
          retries, and how those numbers change as the clock runs down.
        </p>
      </section>

      <section className="panel">
        <h2>How a freeze works</h2>
        <p>
          After you move, the app scores <strong>optimality</strong>: how readily a stronger human
          would play the same move, as a percent of their top-move probability. The rating used for
          that check is the expert rating, which is independent of the bot you are playing.
        </p>
        <p>
          A freeze does not tell you <em>why</em> the move failed. Real freezes and occasional{' '}
          <strong>decoy</strong> freezes look identical, so you cannot treat a freeze as a free
          “this was a mistake” signal. Repeating the same move is allowed; that is treated as
          confidence in the original choice. After several failed attempts, the app reveals the
          expert’s top move as an arrow. You can play that, or any other legal move; either way the
          turn is recorded as a miss.
        </p>
        <p>
          Not every position is scored. The app skips evaluation while you are still in the opening
          book, when there is only one legal move, or when the game is already over. Once you leave
          the book, later moves are scored as usual. Optimality and attempts show up on the
          post-game report, not during play.
        </p>
      </section>

      <section className="panel">
        <h2>This browser only</h2>
        <p>
          Prima runs entirely in this browser. There is no server, no account, and nothing synced
          to the cloud. The engines run locally, and everything the app stores stays on this
          machine. If you clear site data, that history is gone — the only backup is exporting and
          importing JSON from Settings.
        </p>
      </section>

      <section className="panel">
        <h2>Source and licenses</h2>
        <p>
          Prima is free software under the{' '}
          <a href="https://github.com/abhaybd/Prima/blob/main/LICENSE">
            GNU Affero General Public License v3
          </a>
          . Source is on GitHub:{' '}
          <a href="https://github.com/abhaybd/Prima">abhaybd/Prima</a>.
        </p>
        <ul>
          <li>
            <a href="https://github.com/CSSLab/maia3">Maia-3</a> (AGPL-3.0) — opponent and expert
            policy.{' '}
            <a href="https://huggingface.co/bqrio/maia3-onnx">Browser ONNX export</a>
          </li>
          <li>
            <a href="https://github.com/official-stockfish/Stockfish">Stockfish</a> (GPL-3.0) —
            wasm build from <a href="https://github.com/nmrugg/stockfish.js">nmrugg/stockfish.js</a>
          </li>
          <li>
            Opening book: first 6 moves of{' '}
            <a href="https://github.com/official-stockfish/books">official-stockfish/books</a>{' '}
            <code>8moves_v3</code>
          </li>
        </ul>
      </section>
    </div>
  )
}
