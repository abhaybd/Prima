import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Chess } from 'chess.js'
import { afterEach, describe, expect, it } from 'vitest'
import {
  OpeningBook,
  assertOpeningBook,
  encodeOpeningBook,
  hashPositionKey,
  loadOpeningBook,
  positionKey,
  resetOpeningBookCache,
} from './openingBook'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const START_KEY = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'
const E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const A4_FEN = 'rnbqkbnr/pppppppp/8/8/P7/8/1PPPPPPP/RNBQKBNR b KQkq - 0 1'

describe('opening book', () => {
  afterEach(() => {
    resetOpeningBookCache()
  })

  it('keys positions without move clocks', () => {
    expect(positionKey(START_FEN)).toBe(START_KEY)
    expect(positionKey(E4_FEN)).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
    )
  })

  it('hashes startpos stably', () => {
    expect(hashPositionKey(START_KEY).toString(16)).toBe('e7550032f70614fc')
  })

  it('skips only positions present in the book', () => {
    const chess = new Chess()
    chess.move('e4')
    const book = new OpeningBook([hashPositionKey(positionKey(chess.fen()))])
    expect(book.hasFen(E4_FEN)).toBe(true)
    expect(book.hasFen(A4_FEN)).toBe(false)
    expect(book.hasFen(START_FEN)).toBe(false)
  })

  it('round-trips little-endian hashes', () => {
    const hashes = [
      hashPositionKey(positionKey(E4_FEN)),
      hashPositionKey(START_KEY),
    ]
    const book = OpeningBook.fromBuffer(encodeOpeningBook(hashes))
    expect(book.size).toBe(2)
    expect(book.hasFen(START_FEN)).toBe(true)
    expect(book.hasFen(E4_FEN)).toBe(true)
    expect(book.hasFen(A4_FEN)).toBe(false)
  })

  it('rejects HTML and truncated files', () => {
    const html = new TextEncoder().encode('<!doctype html><html lang="en">').buffer
    expect(() => assertOpeningBook(html, 8)).toThrow(/HTML/)
    expect(() => assertOpeningBook(new ArrayBuffer(7))).toThrow(/multiple of 8/)
    expect(() => assertOpeningBook(new ArrayBuffer(8), 64)).toThrow(/too small/)
  })

  it('loads over fetch and caches', async () => {
    const buf = encodeOpeningBook([hashPositionKey(positionKey(E4_FEN))])
    const fetchImpl: typeof fetch = async () =>
      new Response(buf, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
    const book = await loadOpeningBook({ url: '/books/test.u64', fetchImpl, minBytes: 0 })
    expect(book.hasFen(E4_FEN)).toBe(true)
    const again = await loadOpeningBook({
      url: '/books/other.u64',
      fetchImpl: async () => {
        throw new Error('should use cache')
      },
    })
    expect(again).toBe(book)
  })
})

describe('8moves_v3 artifact', () => {
  it('covers the first 6 moves of a line, not the 7th', () => {
    const raw = readFileSync(resolve('public/books/8moves_v3.u64'))
    const book = OpeningBook.fromBuffer(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    )
    expect(book.size).toBeGreaterThan(40_000)
    expect(book.size).toBeLessThan(80_000)
    expect(book.hasFen(E4_FEN)).toBe(true)
    expect(book.hasFen(A4_FEN)).toBe(false)
    expect(book.hasFen(START_FEN)).toBe(true)

    const chess = new Chess()
    const firstSix = ['Nf3', 'd5', 'g3', 'c6', 'Bg2', 'Nf6', 'd3', 'Bg4', 'h3', 'Bh5', 'b3', 'e6']
    for (const san of firstSix) chess.move(san)
    expect(book.hasFen(chess.fen())).toBe(true)
    chess.move('Bb2')
    expect(book.hasFen(chess.fen())).toBe(false)
  })
})
