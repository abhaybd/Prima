import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

const ORT_FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']

function copyOrtWasm(): void {
  const dest = resolve(root, 'public/ort')
  const srcDir = resolve(root, 'node_modules/onnxruntime-web/dist')
  mkdirSync(dest, { recursive: true })
  for (const file of ORT_FILES) {
    copyFileSync(resolve(srcDir, file), resolve(dest, file))
  }
}

function ortAssetsPlugin(): Plugin {
  return {
    name: 'ort-assets',
    buildStart() {
      copyOrtWasm()
    },
    configureServer(server) {
      copyOrtWasm()
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (!url.endsWith('.onnx')) {
          next()
          return
        }
        const file = resolve(root, 'public', url.replace(/^\//, ''))
        if (!existsSync(file)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain')
          res.end('ONNX model not found')
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), ortAssetsPlugin()],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
