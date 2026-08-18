import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vitest/config'
import {
  PWA_NAVIGATE_FALLBACK_DENYLIST,
  PWA_PRECACHE_GLOBS,
  PWA_PRECACHE_IGNORE,
  PWA_PRECACHE_MAX_BYTES,
} from './src/lib/pwa'

const root = dirname(fileURLToPath(import.meta.url))

const PWA_THEME = '#0e1116'

function missingOnnx(req: IncomingMessage, res: ServerResponse, next: () => void): void {
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
}

function missingOnnxPlugin(): Plugin {
  return {
    name: 'missing-onnx',
    configureServer(server) {
      server.middlewares.use(missingOnnx)
    },
    configurePreviewServer(server) {
      server.middlewares.use(missingOnnx)
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
  plugins: [
    react(),
    missingOnnxPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      // globPatterns already copies public png/js/wasm/u64; listing them again duplicates precache URLs.
      includeManifestIcons: false,
      manifest: {
        name: 'Prima',
        short_name: 'Prima',
        description: 'Blitz chess trainer: play acceptably on sight against a human-like bot.',
        theme_color: PWA_THEME,
        background_color: PWA_THEME,
        display: 'standalone',
        lang: 'en',
        categories: ['games', 'education'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: PWA_PRECACHE_GLOBS,
        globIgnores: PWA_PRECACHE_IGNORE,
        maximumFileSizeToCacheInBytes: PWA_PRECACHE_MAX_BYTES,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: PWA_NAVIGATE_FALLBACK_DENYLIST,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
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
