Stockfish 8-move opening suite (first 6 moves)
==============================================

`8moves_v3.u64` hashes positions from the first 6 full moves (12 plies) of:

https://github.com/official-stockfish/books/blob/master/8moves_v3.pgn.zip

Each 8-byte little-endian FNV-1a-64 hash is `positionKey(fen)` (board, side,
castling, and en passant; clocks dropped). Rebuild with:

```
npm run book
```
