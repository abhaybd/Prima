# Prima

Prima is a chess trainer that runs in your browser. The name is short for *prima facie* — from first look — because the skill it trains is judging a position on sight: playing *acceptably* when the clock is running, not hunting for the engine-best move.

You play blitz against a human-like [Maia-3](https://github.com/CSSLab/maia3) bot. After each of your moves, the app checks whether a stronger human (the *expert*) would also play it, relative to their top choice. If that **optimality** is too low, the position **freezes**: the move is undone, a neutral overlay appears, and you try again.

The bet is that strong blitz is not finding best moves quickly, but keeping unacceptable ones off the board while time is running out. What the app tracks, then, is freeze rate, retries, and how those numbers change as the clock runs down. In-depth stats are logged as you play, and you can review them in the dashboard.

## Scope

Prima runs entirely in your browser. There is no server, no account, and nothing synced to the cloud. You play on this machine, with the engines running locally as WebAssembly. Settings are saved in `localStorage`; games and move telemetry go into IndexedDB. If you clear site data, that history is gone — the only backup is exporting and importing JSON from Settings.

## How a freeze works

After you move, the app scores **optimality**: how readily a stronger human would play the same move, as a percent of their top-move probability. The rating used for that check is the expert rating, which is independent of the bot you are playing.

A freeze does not tell you *why* the move failed. Real freezes and occasional **decoy** freezes look identical, so you cannot treat a freeze as a free “this was a mistake” signal. Repeating the same move is allowed; that is treated as confidence in the original choice. After several failed attempts, the app reveals the expert’s top move as an arrow. You can play that, or any other legal move; either way the turn is recorded as a miss.

Not every position is scored. The app skips evaluation while you are still in the opening book, when there is only one legal move, or when the game is already over. Once you leave the book, later moves are scored as usual.

## Run

```bash
npm install
npm test
npm run dev
```

The first time you click **New game**, the app downloads a Maia-3 ONNX model from Hugging Face and caches it in the browser. That is about 46 MB for the default 23M fp16 model, or about 11 MB if you pick the 5M model in Settings as a low-bandwidth option. The 79M model is not used; the accuracy gain over 23M is not worth the extra download for a client app.

If you would rather skip Hugging Face, put `maia3-23m.fp16.onnx` or `maia3-5m.fp16.onnx` in `public/models/`. Those files come from [bqrio/maia3-onnx](https://huggingface.co/bqrio/maia3-onnx).

When the dev server or a production build starts, Vite copies ONNX Runtime WASM into `public/ort/`.

## License

[GNU Affero General Public License v3](LICENSE).

If this is hosted, AGPL §13 is satisfied by linking this repository (also in the in-app footer):

- App: https://github.com/abhaybd/Prima
- Stockfish (GPL-3.0): https://github.com/official-stockfish/Stockfish — wasm build [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js)
- Opening book: [official-stockfish/books](https://github.com/official-stockfish/books) `8moves_v3` (first 6 moves)
- Maia-3 (AGPL-3.0): https://github.com/CSSLab/maia3
- Browser ONNX export: https://huggingface.co/bqrio/maia3-onnx
