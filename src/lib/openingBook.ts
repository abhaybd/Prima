const HTML_START = /^\s*</
const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n

export const OPENING_BOOK_URL = '/books/8moves_v3.u64'
export const OPENING_BOOK_MIN_BYTES = 8 * 1_000

export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

export function hashPositionKey(key: string): bigint {
  let hash = FNV_OFFSET
  for (let i = 0; i < key.length; i++) {
    hash ^= BigInt(key.charCodeAt(i))
    hash = BigInt.asUintN(64, hash * FNV_PRIME)
  }
  return hash
}

export function assertOpeningBook(buf: ArrayBuffer, minBytes = 0): void {
  const preview = new Uint8Array(buf, 0, Math.min(64, buf.byteLength))
  const ascii = new TextDecoder('latin1').decode(preview)
  if (HTML_START.test(ascii) || ascii.includes('<!DOCTYPE') || ascii.includes('<html')) {
    throw new Error('Got HTML instead of an opening book')
  }
  if (minBytes > 0 && buf.byteLength < minBytes) {
    throw new Error(
      `Opening book too small (${buf.byteLength} bytes); expected at least ${minBytes}. Got a web page instead of the book?`,
    )
  }
  if (buf.byteLength % 8 !== 0) {
    throw new Error(`Opening book length ${buf.byteLength} is not a multiple of 8`)
  }
}

export function encodeOpeningBook(hashes: Iterable<bigint>): ArrayBuffer {
  const unique = [...new Set(hashes)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const buf = new ArrayBuffer(unique.length * 8)
  const view = new DataView(buf)
  unique.forEach((hash, i) => view.setBigUint64(i * 8, hash, true))
  return buf
}

export class OpeningBook {
  private readonly hashes: Set<bigint>

  constructor(hashes: Iterable<bigint> = []) {
    this.hashes = new Set(hashes)
  }

  static fromBuffer(buf: ArrayBuffer, minBytes = 0): OpeningBook {
    assertOpeningBook(buf, minBytes)
    const view = new DataView(buf)
    const hashes: bigint[] = []
    for (let i = 0; i < view.byteLength; i += 8) {
      hashes.push(view.getBigUint64(i, true))
    }
    return new OpeningBook(hashes)
  }

  get size(): number {
    return this.hashes.size
  }

  hasFen(fen: string): boolean {
    return this.hashes.has(hashPositionKey(positionKey(fen)))
  }
}

let cached: Promise<OpeningBook> | null = null

export function resetOpeningBookCache(): void {
  cached = null
}

export function loadOpeningBook(options: {
  url?: string
  fetchImpl?: typeof fetch
  minBytes?: number
} = {}): Promise<OpeningBook> {
  const url = options.url ?? OPENING_BOOK_URL
  const fetchImpl = options.fetchImpl ?? fetch
  const minBytes = options.minBytes ?? OPENING_BOOK_MIN_BYTES
  cached ??= (async () => {
    try {
      const res = await fetchImpl(url)
      if (!res.ok) throw new Error(`Opening book HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      return OpeningBook.fromBuffer(buf, minBytes)
    } catch (err) {
      cached = null
      throw err
    }
  })()
  return cached
}
