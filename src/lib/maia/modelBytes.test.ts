import { describe, expect, it } from 'vitest'
import { assertOnnxModel } from './modelBytes'

function bytes(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text)
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
}

describe('assertOnnxModel', () => {
  it('rejects HTML (Vite SPA fallback)', () => {
    expect(() => assertOnnxModel(bytes('<!doctype html><html lang="en">'), 16)).toThrow(/HTML/)
  })

  it('rejects tiny buffers', () => {
    const buf = new Uint8Array([0x08, 0x08, 0x12, 0x07]).buffer
    expect(() => assertOnnxModel(buf, 1_000_000)).toThrow(/too small/)
  })

  it('accepts a protobuf-like payload that is large enough', () => {
    const bytes = new Uint8Array(32)
    bytes.set([0x08, 0x08, 0x12, 0x07, 0x70, 0x79, 0x74, 0x6f, 0x72, 0x63, 0x68])
    expect(() => assertOnnxModel(bytes.buffer, 16)).not.toThrow()
  })
})
