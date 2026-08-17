# Agent notes

Client-only React + TypeScript + Vite app. No backend. Read [README.md](README.md) for product intent and how to run. This file is the implementation contract.

## Layout

```
src/types/        Config, GameRecord, MoveRecord
src/lib/          freeze math, WDL, clocks, phase, Maia tokenize/decode
src/engine/       Stockfish UCI client, Maia RPC client (seq ids)
src/workers/      maia.worker.ts — one ONNX session
src/store/        localStorage config, IndexedDB, JSON export/import
src/game/         useGame — loop, freeze state, clocks
src/views/        Play, Settings, Report, Dashboard
src/components/   Board, Clocks, FreezeOverlay, MoveList
public/engines/   stockfish-18-lite-single.{js,wasm}
public/ort/       copied from onnxruntime-web on Vite start (gitignored)
public/models/    optional local ONNX; missing .onnx URLs must 404, never SPA HTML
public/books/     first 6 moves of 8moves_v3 as position hashes; skip eval while the move stays in book
```

Routes: `/`, `/settings`, `/report/:gameId`, `/dashboard`.

Main thread owns UI, chess.js, clocks, freeze overlay. It never blocks on engines. Stockfish is a classic Worker talking UCI. Maia is a module Worker with onnxruntime-web. RPC uses incrementing ids; ignore stale replies.

## Invariants

**Freeze overlay.** Identical for real and decoy freezes. No evals, no channel, no hints during play. Reveal only after `maxRetries` or on the post-game report.

**Decoys.** With probability `decoyFreezeRate`, freeze a move that passed both channels. Log `trigger: 'decoy'`; exclude from quality metrics. Repeating the **same** move is accepted (confidence) — do not roll another decoy on that retry. A different move is re-evaluated normally. Always wait `verdictGateMs` before showing the verdict (including same-move decoy accepts).

**Game loop.** On user move `m` in `p`: start verdict, opponent sample, and the gate together. Freeze → undo `m`, discard the opponent move. Pass → apply opponent move.

**Two Maia conditionings** (same ONNX session, `elo_self` / `elo_oppo`):

- Opponent (sample legal moves, never argmax): `elo_self = opponentElo`, `elo_oppo = opponentElo`
- Expert (full distribution): `elo_self = thresholdElo`, `elo_oppo = opponentElo`

`thresholdElo` (Expert Elo in the UI) and `opponentElo` stay independent. There is no separate user Elo; the bot rating is used for both Maia opponent-policy inputs. UI copy: Maia thresholding is the **expert**; Channel A `ratio` is **optimality** (percent). Stored fields and freeze triggers (`ratio`) stay as-is.

**Channel A.** Optimality `ratio = P(m) / P(top)` after softmax over **legal** moves only. Ratio, not raw probability; show as a percent in the UI.

**Channel B (provisional).** Two sequential searches, never MultiPV: `p` then `p+m`. `E = (W + 0.5*D) / 1000` from STM WDL. Convert both to user POV before subtracting: `wdlDelta = E_best_user − E_after_user`. After the user’s move, STM is the opponent, so negate. Lazy-init Stockfish only when `wdlClauseEnabled`. Keep Channel B a separable branch.

**Verdict.** `freeze ⇔ ratio < tauRatio OR (wdlClauseEnabled && wdlDelta > tauWdl)`. Triggers: `none | ratio | wdl | both | decoy`.

**Skip eval** (no freeze possible): position after `m` is in the opening book; one legal move; position after `m` is terminal; Channel B ran and pre-move `E(wdl)` is `< 0.03` or `> 0.97`. Book is the first 6 full moves of Stockfish `8moves_v3`. Lookup uses the first four FEN fields (board, STM, castling, EP). A move that leaves the book is evaluated.

**Maia I/O.** Tokens `[1,64,12]` piece one-hot; **mirror board and colors when Black to move**. Vocab is 4352 (4096 from–to + 256 white-perspective promotions `q,r,b,n`). Map Black UCIs through `mirrorMove` before indexing. Wrong flip or promo decode looks plausible — keep the tokenize/decode fixtures (startpos, promotion, Black to move).

**Stockfish.** Single-threaded lite only (`public/engines/`). No COOP/COEP. `UCI_ShowWDL` on. ~80ms movetime. Do not import the engine into the Vite bundle; spawn `new Worker('/engines/stockfish-18-lite-single.js')`.

**ORT.** `onnxruntime-web/wasm`, `numThreads = 1`, `proxy = false`, wasm files from `/ort/`. Do not assume WebGPU in the worker.

**Models.** Fetch Hugging Face first, then `/models/…`. Validate bytes before caching or passing to ORT (`assertOnnxModel`): reject HTML and tiny files. Vite must 404 missing `.onnx` paths — SPA fallback of `index.html` as a “model” causes protobuf parse errors. Drop invalid Cache Storage entries.

## Persistence

- Config: `localStorage` key `blitzdrill.config.v1`. Defaults in `src/types/config.ts`.
- IndexedDB `blitzdrill`: `games` keyed by `gameId`; `moves` keyed by `[gameId, ply]`, index `gameId`.
- `isForcing` and `phase` are written at insert time. Phase: opening if `ply < 24`; endgame if non-pawn non-king pieces ≤ 6; else middlegame. `isForcing` if SF best is capture, check, or promotion.
- JSON export/import covers config + both stores.

## Tests

`npm test` (Vitest). Cover WDL user-POV sign, freeze/exclusions, Maia vocab/tokenize/decode, ONNX-bytes guard, opening book, config defaults. Do not add Playwright unless asked.

When changing freeze or WDL math, add a unit test first. When changing Maia encode/decode, extend `src/lib/maia/maia.test.ts` before wiring UI.
