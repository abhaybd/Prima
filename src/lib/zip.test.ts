import { describe, expect, it } from 'vitest'
import { zipStore } from './zip'

function unzipStore(buf: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const out = new Map<string, Uint8Array>()
  let offset = 0
  while (offset + 4 <= buf.length) {
    const sig = view.getUint32(offset, true)
    if (sig === 0x02014b50 || sig === 0x06054b50) break
    if (sig !== 0x04034b50) throw new Error(`bad local signature at ${offset}`)
    const method = view.getUint16(offset + 8, true)
    const size = view.getUint32(offset + 18, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = new TextDecoder().decode(buf.subarray(nameStart, nameStart + nameLen))
    const dataStart = nameStart + nameLen + extraLen
    if (method !== 0) throw new Error(`expected STORE, got ${method}`)
    out.set(name, buf.slice(dataStart, dataStart + size))
    offset = dataStart + size
  }
  return out
}

describe('zipStore', () => {
  it('packs files so they can be read back', () => {
    const encoder = new TextEncoder()
    const zip = zipStore([
      { name: 'prima-a.pgn', data: encoder.encode('[Event "A"]\n\n1. e4 *\n') },
      { name: 'prima-b.pgn', data: encoder.encode('[Event "B"]\n\n1. d4 *\n') },
    ])
    const files = unzipStore(zip)
    expect([...files.keys()]).toEqual(['prima-a.pgn', 'prima-b.pgn'])
    expect(new TextDecoder().decode(files.get('prima-a.pgn'))).toBe('[Event "A"]\n\n1. e4 *\n')
    expect(new TextDecoder().decode(files.get('prima-b.pgn'))).toBe('[Event "B"]\n\n1. d4 *\n')
  })

  it('writes a valid empty archive', () => {
    const zip = zipStore([])
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    expect(zip.length).toBe(22)
    expect(view.getUint32(0, true)).toBe(0x06054b50)
    expect(view.getUint16(8, true)).toBe(0)
  })
})
