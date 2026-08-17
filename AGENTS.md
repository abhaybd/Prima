# Agent notes

Client-only React + TypeScript + Vite app. No backend. Read [README.md](README.md) for product intent and how to run. This file is the implementation contract.

## Layout

```
src/types/        Config, GameRecord, MoveRecord
src/lib/          freeze math, clocks, phase, Maia tokenize/decode, Stockfish score→pawns
src/engine/       Maia RPC client (seq ids); Stockfish UCI client
src/workers/      maia.worker.ts — one ONNX session
src/store/        localStorage config, IndexedDB, JSON export/import
src/game/         useGame — loop, freeze state, clocks
src/views/        Play, Settings, Report, Dashboard, About
src/components/   Board, Clocks, FreezeOverlay, MoveList, EvalChart
public/engines/   stockfish-18-lite-single.{js,wasm} — eval Worker during play (not freeze)
public/ort/       copied from onnxruntime-web on Vite start (gitignored)
public/models/    optional local ONNX; missing .onnx URLs must 404, never SPA HTML
public/books/     first 6 moves of 8moves_v3 as position hashes; skip eval while the move stays in book
```

Routes: `/`, `/settings`, `/report/:gameId`, `/dashboard`, `/about`.

Main thread owns UI, chess.js, clocks, freeze overlay. It never blocks on engines. Maia is a module Worker with onnxruntime-web. Stockfish is a classic Worker (`stockfish-18-lite-single`) used only to record eval after each **committed** ply. RPC uses incrementing ids; ignore stale replies.

## Invariants

**Freeze overlay.** Identical for real and decoy freezes. No evals, no channel, no hints during play. Reveal only after `maxRetries` or on the post-game report. After `maxRetries`, show the expert top as an arrow; the user may play any legal move. Do not auto-play the expert move.

**Stockfish eval.** After a ply is committed (accepted user move or opponent move), queue a short Stockfish search. Do not await it for freeze/verdict/clocks. Store White-POV **pawns** (`cp / 100`); if SF reports mate, also store mate-in-N (positive = White mates). Frozen attempts that are undone are not evaluated. Report: eval timeline (ply on x, pawns on y) and an Eval column on the moves table. Older games without evals omit the graph.

**Decoys.** With probability `decoyFreezeRate`, freeze a move that passed optimality. Log `trigger: 'decoy'`; exclude from quality metrics. Repeating the **same** move is accepted (confidence) — do not roll another decoy on that retry. A different move is re-evaluated normally. If that later move passes without a real freeze, the ply still logs `decoy` so the report can show both tries. Report move rows: real freezes stay highlighted as today; decoys use the same yellow (`#f0c14b`) as elsewhere. Do not show a trigger column.

**Game loop.** On user move `m` in `p`: start verdict and opponent sample together. Freeze → undo `m`, discard the opponent move. Pass → apply opponent move.

**Two Maia conditionings** (same ONNX session, `elo_self` / `elo_oppo`):

- Opponent (sample legal moves, never argmax): `elo_self = opponentElo`, `elo_oppo = opponentElo`
- Expert (full distribution): `elo_self = thresholdElo`, `elo_oppo = opponentElo`

`thresholdElo` (Expert Elo in the UI) and `opponentElo` stay independent. There is no separate user Elo; the bot rating is used for both Maia opponent-policy inputs. UI copy: Maia thresholding is the **expert**; `ratio` is **optimality** (percent). Stored freeze triggers (`ratio`) stay as-is. Older records may still have `wdl` / `both`.

**Optimality.** `ratio = P(m) / P(top)` after softmax over **legal** moves only. Ratio, not raw probability; show as a percent in the UI.

**Verdict.** `freeze ⇔ ratio < tauRatio`. New games log `none | ratio | decoy`. Treat stored `wdl` / `both` as real freezes when reading old games.

**Skip eval** (no freeze possible): position after `m` is in the opening book; one legal move; position after `m` is terminal. Book is the first 6 full moves of Stockfish `8moves_v3`. Lookup uses the first four FEN fields (board, STM, castling, EP). A move that leaves the book is evaluated.

**Maia I/O.** Tokens `[1,64,12]` piece one-hot; **mirror board and colors when Black to move**. Vocab is 4352 (4096 from–to + 256 white-perspective promotions `q,r,b,n`). Map Black UCIs through `mirrorMove` before indexing. Wrong flip or promo decode looks plausible — keep the tokenize/decode fixtures (startpos, promotion, Black to move).

**ORT.** `onnxruntime-web/wasm`, `numThreads = 1`, `proxy = false`, wasm files from `/ort/`. Do not assume WebGPU in the worker.

**Models.** Fetch Hugging Face first, then `/models/…`. Validate bytes before caching or passing to ORT (`assertOnnxModel`): reject HTML and tiny files. Vite must 404 missing `.onnx` paths — SPA fallback of `index.html` as a “model” causes protobuf parse errors. Drop invalid Cache Storage entries.

## Persistence

- Config: `localStorage` key `blitzdrill.config.v1`. Defaults in `src/types/config.ts`.
- IndexedDB `blitzdrill`: `games` keyed by `gameId`; `moves` keyed by `[gameId, ply]`, index `gameId`. `GameRecord.sfEvals` is the full ply timeline; `MoveRecord.sfEval` / `sfMate` is the eval after that user move.
- `isForcing` and `phase` are written at insert time. Phase: opening if `ply < 24`; endgame if non-pawn non-king pieces ≤ 6; else middlegame. `isForcing` if the user’s move is capture, check, or promotion.
- JSON export/import covers config + both stores.

## Tests

`npm test` (Vitest). Cover freeze/exclusions, Maia vocab/tokenize/decode, ONNX-bytes guard, opening book, config defaults, Stockfish score→pawns. Do not add Playwright unless asked.

When changing freeze math, add a unit test first. When changing Maia encode/decode, extend `src/lib/maia/maia.test.ts` before wiring UI.
