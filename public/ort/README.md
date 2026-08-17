ONNX Runtime WebAssembly files are copied here from
`node_modules/onnxruntime-web/dist` when Vite starts.

Needed so the Maia worker can load WASM from a stable URL (`/ort/…`)
instead of next to the bundled worker script.
