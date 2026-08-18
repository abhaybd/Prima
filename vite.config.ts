import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

function missingOnnxPlugin(): Plugin {
  return {
    name: 'missing-onnx',
    configureServer(server) {
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

function viteBase(): string {
  const raw = process.env.BASE_PATH?.trim()
  if (!raw || raw === '/') return '/'
  const withLead = raw.startsWith('/') ? raw : `/${raw}`
  return withLead.endsWith('/') ? withLead : `${withLead}/`
}

export default defineConfig({
  base: viteBase(),
  plugins: [react(), missingOnnxPlugin()],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
