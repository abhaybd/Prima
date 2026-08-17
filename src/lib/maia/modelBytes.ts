const HTML_START = /^\s*</

export function assertOnnxModel(buf: ArrayBuffer, minBytes: number): void {
  if (buf.byteLength < minBytes) {
    throw new Error(
      `Model file too small (${buf.byteLength} bytes); expected at least ${minBytes}. Got a web page instead of ONNX?`,
    )
  }
  const preview = new Uint8Array(buf, 0, Math.min(64, buf.byteLength))
  const ascii = new TextDecoder('latin1').decode(preview)
  if (HTML_START.test(ascii) || ascii.includes('<!DOCTYPE') || ascii.includes('<html')) {
    throw new Error('Got HTML instead of an ONNX model')
  }
}

export const MODEL_MIN_BYTES: Record<'23m' | '5m', number> = {
  '23m': 20_000_000,
  '5m': 5_000_000,
}
