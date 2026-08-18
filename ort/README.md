ONNX Runtime WebAssembly is no longer copied here.

The Maia worker loads `ort-wasm-simd-threaded.{wasm,mjs}` through Vite `?url`
imports from `onnxruntime-web/dist`. Files in this folder are leftover copies
and are gitignored. Vite cannot import `.mjs` from `public/` as a module.
