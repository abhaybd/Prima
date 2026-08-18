import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

/** Vite `?url` assets. Use package exports, not `dist/` or `public/ort/`. */
export const ortWasmPaths = {
  wasm: ortWasmUrl,
  mjs: ortMjsUrl,
}
