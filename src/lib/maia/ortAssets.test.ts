import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const srcRoot = join(root, 'src')

const PUBLIC_ORT_MJS = /(?:\$\{(?:base|import\.meta\.env\.BASE_URL)\}|['"`]\/)ort\/[^'"`\s]+\.mjs/
const ORT_URL_IMPORT = /from\s+['"](onnxruntime-web\/[^'"]+)\?url['"]/g

function walkTs(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      out.push(...walkTs(path))
      continue
    }
    if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) continue
    if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(path)
  }
  return out
}

function ortPackageExports(): Record<string, unknown> {
  const pkg = JSON.parse(
    readFileSync(join(root, 'node_modules/onnxruntime-web/package.json'), 'utf8'),
  ) as { exports?: Record<string, unknown> }
  return pkg.exports ?? {}
}

describe('ORT wasm loading', () => {
  it('uses onnxruntime-web package exports, not a blocked dist/ path', () => {
    const src = readFileSync(join(srcRoot, 'lib/maia/ortAssets.ts'), 'utf8')
    const specifiers = [...src.matchAll(ORT_URL_IMPORT)].map((m) => m[1])
    expect(specifiers).toEqual(
      expect.arrayContaining([
        'onnxruntime-web/ort-wasm-simd-threaded.wasm',
        'onnxruntime-web/ort-wasm-simd-threaded.mjs',
      ]),
    )
    const exported = ortPackageExports()
    for (const specifier of specifiers) {
      const subpath = specifier.replace(/^onnxruntime-web/, '.')
      expect(exported, specifier).toHaveProperty(subpath)
      const target = exported[subpath]
      expect(typeof target).toBe('string')
      expect(existsSync(join(root, 'node_modules/onnxruntime-web', target as string))).toBe(true)
    }
  })

  it('does not import ORT glue from public/ (Vite cannot transform those)', () => {
    for (const file of walkTs(srcRoot)) {
      const text = readFileSync(file, 'utf8')
      expect(text, relative(root, file)).not.toMatch(PUBLIC_ORT_MJS)
    }
  })

  it('transforms ORT assets and the Maia worker without public/ort mjs', async () => {
    const server = await createServer({
      configFile: join(root, 'vite.config.ts'),
      server: { middlewareMode: true, hmr: false },
      optimizeDeps: { noDiscovery: true },
    })
    try {
      const assets = await server.transformRequest('/src/lib/maia/ortAssets.ts')
      expect(assets?.code).toBeTruthy()
      expect(assets!.code).not.toContain('Missing')
      expect(assets!.code).not.toContain('/ort/ort-wasm-simd-threaded.mjs')

      const worker = await server.transformRequest('/src/workers/maia.worker.ts')
      expect(worker?.code).toBeTruthy()
      expect(worker!.code).not.toContain('/ort/ort-wasm-simd-threaded.mjs')

      try {
        const result = await server.transformRequest('/ort/ort-wasm-simd-threaded.mjs')
        expect(result, 'public ORT mjs must not load as a Vite module').toBeNull()
      } catch (err) {
        expect(String(err)).toMatch(/public|exist/i)
      }
    } finally {
      await server.close()
    }
  }, 20_000)
})
