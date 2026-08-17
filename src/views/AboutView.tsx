import styles from './AboutView.module.css'

export function AboutView() {
  return (
    <div className={styles.page}>
      <h1>About</h1>
      <p className="hint">
        A browser chess trainer for acceptable play under time pressure, not engine-optimal
        accuracy.
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
          The hypothesis: strong blitz is not finding best moves quickly. It is reliably avoiding
          unacceptable ones while the clock is ticking. Freeze rate, retries, and how those numbers
          change as the clock runs down are the metrics that matter.
        </p>
      </section>

      <section className="panel">
        <h2>How a freeze works</h2>
        <p>
          After you move, the app scores <strong>optimality</strong> — would a stronger human (the
          expert rating, not the bot) also play this, relative to their top choice? Shown as a
          percent of the expert’s top-move probability.
        </p>
        <p>
          A freeze does not tell you <em>why</em>. Real freezes and occasional <strong>decoy</strong>{' '}
          freezes look identical, so a freeze is not a free “this was a mistake” signal. Repeating
          the same move after a freeze is allowed; that is treated as confidence in the original
          choice. After several failed attempts the app reveals the expert’s top move, plays it,
          and records a miss.
        </p>
        <p>
          Moves that stay in the opening book, forced-only-move positions, and already-decided
          games are not evaluated. Leaving the book is evaluated. Optimality and attempts are shown
          on the post-game report, not during play.
        </p>
      </section>

      <section className="panel">
        <h2>This browser only</h2>
        <p>
          Entirely client-side. No server, accounts, online rating, or cloud sync. Engines run in
          the browser. All state stays in this browser. Clearing site data deletes it.
          Export/import JSON from Settings is the only backup.
        </p>
      </section>

      <section className="panel">
        <h2>Source and licenses</h2>
        <p>
          Blitz Freeze Drill is free software under the{' '}
          <a href="https://github.com/abhaybd/BlitzBrain/blob/main/LICENSE">
            GNU Affero General Public License v3
          </a>
          . Source is on GitHub:{' '}
          <a href="https://github.com/abhaybd/BlitzBrain">abhaybd/BlitzBrain</a>.
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
