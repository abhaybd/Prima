import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createServer } from 'vite'
import {
  PWA_NAVIGATE_FALLBACK_DENYLIST,
  PWA_PRECACHE_GLOBS,
  PWA_PRECACHE_IGNORE,
  PWA_PRECACHE_MAX_BYTES,
  pwaDeniesSpaFallback,
} from './pwa'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

describe('PWA service worker policy', () => {
  it('does not SPA-fallback ONNX, wasm, or opening-book URLs', () => {
    expect(pwaDeniesSpaFallback('/models/maia3-23m.fp16.onnx')).toBe(true)
    expect(pwaDeniesSpaFallback('/Prima/models/missing.onnx')).toBe(true)
    expect(pwaDeniesSpaFallback('https://example.test/models/x.onnx?download=1')).toBe(true)
    expect(pwaDeniesSpaFallback('/engines/stockfish-18-lite-single.wasm')).toBe(true)
    expect(pwaDeniesSpaFallback('/books/8moves_v3.u64')).toBe(true)
    expect(pwaDeniesSpaFallback('/')).toBe(false)
    expect(pwaDeniesSpaFallback('/dashboard')).toBe(false)
    expect(pwaDeniesSpaFallback('/report/abc')).toBe(false)
  })

  it('precaches engines and ORT wasm, and never ONNX models', () => {
    expect(PWA_PRECACHE_GLOBS.join(' ')).toMatch(/wasm/)
    expect(PWA_PRECACHE_GLOBS.join(' ')).toMatch(/u64/)
    expect(PWA_PRECACHE_GLOBS.join(' ')).toMatch(/js/)
    expect(PWA_PRECACHE_IGNORE.some((g) => g.includes('.onnx'))).toBe(true)
    expect(PWA_PRECACHE_IGNORE.some((g) => g.includes('models'))).toBe(true)
    expect(PWA_PRECACHE_MAX_BYTES).toBeGreaterThan(13 * 1024 * 1024)
  })

  it('wires that policy into VitePWA', () => {
    const src = readFileSync(join(root, 'vite.config.ts'), 'utf8')
    expect(src).toContain('VitePWA')
    expect(src).toContain('PWA_NAVIGATE_FALLBACK_DENYLIST')
    expect(src).toContain('PWA_PRECACHE_GLOBS')
    expect(src).toContain('PWA_PRECACHE_IGNORE')
    expect(src).toContain('PWA_PRECACHE_MAX_BYTES')
    expect(PWA_NAVIGATE_FALLBACK_DENYLIST.length).toBeGreaterThan(0)
  })

  it('404s missing ONNX as text, not the SPA HTML', async () => {
    const server = await createServer({
      configFile: join(root, 'vite.config.ts'),
      server: { host: '127.0.0.1', port: 0, hmr: false },
      optimizeDeps: { noDiscovery: true },
    })
    try {
      await server.listen()
      const base = server.resolvedUrls?.local[0]
      expect(base).toBeTruthy()
      const res = await fetch(new URL('models/does-not-exist.onnx', base))
      expect(res.status).toBe(404)
      const body = await res.text()
      expect(body).not.toMatch(/<!doctype html/i)
      expect(body).toMatch(/ONNX model not found/)
    } finally {
      await server.close()
    }
  }, 20_000)
})
