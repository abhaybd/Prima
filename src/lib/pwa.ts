/** ORT wasm is ~13MB; Stockfish lite wasm is ~7MB. Workbox default is 2MB. */
export const PWA_PRECACHE_MAX_BYTES = 20 * 1024 * 1024

/** Hashed bundles plus engines, book, and icons. Never ONNX (optional, huge). */
export const PWA_PRECACHE_GLOBS = ['**/*.{js,css,html,mjs,wasm,svg,png,ico,u64}']

export const PWA_PRECACHE_IGNORE = ['**/node_modules/**', '**/models/**', '**/*.onnx']

/**
 * Workbox SPA fallback must not serve index.html for these.
 * A missing .onnx that returns HTML is parsed as a model.
 */
export const PWA_NAVIGATE_FALLBACK_DENYLIST = [
  /\.onnx(?:\?|$)/i,
  /\.wasm(?:\?|$)/i,
  /\.u64(?:\?|$)/i,
]

export function pwaDeniesSpaFallback(url: string): boolean {
  return PWA_NAVIGATE_FALLBACK_DENYLIST.some((re) => re.test(url))
}
