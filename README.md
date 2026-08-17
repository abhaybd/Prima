# Blitz Freeze Drill

A browser chess trainer for **acceptable play under time pressure**, not engine-optimal accuracy.

You play blitz against a human-like [Maia-3](https://github.com/CSSLab/maia3) bot. After each of your moves, the app checks whether a stronger human (the *expert*) would also play it, relative to their top choice. If that optimality is too low, the position **freezes**: the move is undone, a neutral overlay appears, and you try again. Freeze rate, retries, and how those numbers change as the clock runs down are the metrics that matter.

The hypothesis: strong blitz is not finding best moves quickly. It is reliably avoiding unacceptable ones while the clock is ticking.

## Scope

- Entirely client-side. No server, accounts, online rating, or cloud sync.
- Single-player only.
- Engines run in the browser (WebAssembly).
- All state stays in this browser: settings in `localStorage`, games and move telemetry in IndexedDB. Clearing site data deletes them. Export/import JSON from Settings is the only backup.

## How a freeze works

After you move, the app scores **optimality** — would a stronger human (the *expert* rating, not the bot) also play this, relative to their top choice? Shown as a percent of the expert’s top-move probability.

A freeze does not tell you *why*. Real freezes and occasional **decoy** freezes look identical, so a freeze is not a free “this was a mistake” signal. Repeating the same move after a freeze is allowed; that is treated as confidence in the original choice. After several failed attempts the app reveals the expert’s top move as an arrow. You can play that move or any other; the ply is still recorded as a miss.

Moves that stay in the opening book, forced-only-move positions, and already-decided games are not evaluated. Leaving the book is evaluated.

## Using the app

| Route | What it is |
|---|---|
| `/` | Play: board, your clock, color, bot Elo, time control, freeze overlay |
| `/settings` | Difficulty, freeze behavior, backup |
| `/report/:gameId` | Post-game stats and move-by-move replay (optimality and attempts shown *after* the game) |
| `/dashboard` | Cross-game stats. Primary chart: optimality versus remaining clock |
| `/about` | Product intent, how freezes work, privacy, licenses |

**Settings that are easy to mix up**

- **Opponent Elo** (play page) is bot strength. Maia uses that rating for both sides when the bot moves.
- **Expert Elo** is the bar *your* moves are scored against. Set it above the bot. It is not the bot’s rating.
- **Min optimality** is the difficulty dial. Lower is more permissive.

**Clock during a freeze**

- Pause + penalty (default): clock stops, then a fixed penalty on resolution.
- Keep running: closest to real blitz — sloppiness costs time.
- Pause only: useful while you are still calibrating min optimality.
- Pause, then run: clock stops for a few seconds (default 3), then runs if you are still frozen. A passing move during the pause ends the freeze immediately.

## Metrics

After a game: freeze counts, mean retries, misses, mean optimality, freeze rate on quiet vs forcing positions. The quiet-position rate is the interesting one.

Across games, the **quality versus remaining clock** chart (mean optimality in time buckets) is the point of the tool: it measures degradation under time pressure.

Decoy freezes are excluded from quality metrics. On the game report they are the yellow rows.

## Run

```bash
npm install
npm test
npm run dev
```

On first **New game** the app downloads a Maia-3 ONNX model from Hugging Face (~46 MB for 23M fp16, or ~11 MB for 5M) and caches it in the browser. Default is 23M; 5M is the low-bandwidth option in Settings. The 79M model is not used — the accuracy gain over 23M is negligible for a client download.

Optional: put `maia3-23m.fp16.onnx` / `maia3-5m.fp16.onnx` in `public/models/` to skip Hugging Face. Files come from [bqrio/maia3-onnx](https://huggingface.co/bqrio/maia3-onnx).

Vite copies ONNX Runtime WASM into `public/ort/` when the dev server or production build starts.

## License

[GNU Affero General Public License v3](LICENSE).

If this is hosted, AGPL §13 is satisfied by linking this repository (also in the in-app footer):

- App: https://github.com/abhaybd/BlitzBrain
- Stockfish (GPL-3.0): https://github.com/official-stockfish/Stockfish — wasm build [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js)
- Opening book: [official-stockfish/books](https://github.com/official-stockfish/books) `8moves_v3` (first 6 moves)
- Maia-3 (AGPL-3.0): https://github.com/CSSLab/maia3
- Browser ONNX export: https://huggingface.co/bqrio/maia3-onnx
