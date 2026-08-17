import type { LegalPolicy } from '../lib/maia/decode'
import { assertOnnxModel, MODEL_MIN_BYTES } from '../lib/maia/modelBytes'
import type { MaiaVariant } from '../types/config'
import { SeqRpc, type RpcResponse } from './rpc'

export interface PolicyResult {
  policy: LegalPolicy[]
}

export interface MaiaClient {
  load(
    variant: MaiaVariant,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void>
  policy(fen: string, eloSelf: number, eloOppo: number): Promise<PolicyResult>
  terminate(): void
}

const MODEL_FILES: Record<MaiaVariant, string> = {
  '23m': 'maia3-23m.fp16.onnx',
  '5m': 'maia3-5m.fp16.onnx',
}

const CACHE_NAME = 'prima-models'

function modelUrls(variant: MaiaVariant): string[] {
  const file = MODEL_FILES[variant]
  return [
    `https://huggingface.co/bqrio/maia3-onnx/resolve/main/${file}`,
    `${import.meta.env.BASE_URL}models/${file}`,
  ]
}

async function fetchWithProgress(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch model (${res.status}) from ${url}`)
  const contentType = res.headers.get('Content-Type') ?? ''
  if (contentType.includes('text/html')) {
    throw new Error(`Got HTML from ${url}, not an ONNX model`)
  }
  const total = Number(res.headers.get('Content-Length') ?? 0)
  if (!res.body) return res.arrayBuffer()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress?.(loaded, total)
  }
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}

async function readValidCached(
  cache: Cache,
  url: string,
  minBytes: number,
): Promise<ArrayBuffer | null> {
  const cached = await cache.match(url)
  if (!cached || !cached.ok) return null
  const buf = await cached.arrayBuffer()
  try {
    assertOnnxModel(buf, minBytes)
    return buf
  } catch {
    await cache.delete(url)
    return null
  }
}

async function loadModelBuffer(
  variant: MaiaVariant,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const urls = modelUrls(variant)
  const minBytes = MODEL_MIN_BYTES[variant]
  const cache = 'caches' in globalThis ? await caches.open(CACHE_NAME) : null
  if (cache) {
    for (const url of urls) {
      const cached = await readValidCached(cache, url, minBytes)
      if (cached) {
        onProgress?.(cached.byteLength, cached.byteLength)
        return cached
      }
    }
  }
  let lastError: unknown
  for (const url of urls) {
    try {
      const buf = await fetchWithProgress(url, onProgress)
      assertOnnxModel(buf, minBytes)
      if (cache) {
        await cache.put(
          url,
          new Response(buf.slice(0), {
            headers: { 'Content-Type': 'application/octet-stream' },
          }),
        )
      }
      return buf
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not download Maia model')
}

export function createMaiaClient(): MaiaClient {
  const worker = new Worker(new URL('../workers/maia.worker.ts', import.meta.url), {
    type: 'module',
  })
  const rpc = new SeqRpc()
  worker.addEventListener('message', (event: MessageEvent<RpcResponse>) => {
    rpc.settle(event.data)
  })

  async function call<T>(method: string, args: unknown, transfer?: Transferable[]): Promise<T> {
    const id = rpc.next()
    const wait = rpc.wait<T>(id)
    worker.postMessage({ id, method, args }, transfer ?? [])
    return wait
  }

  return {
    async load(variant, onProgress) {
      const buffer = await loadModelBuffer(variant, onProgress)
      await call('load', { buffer }, [buffer])
    },
    async policy(fen, eloSelf, eloOppo) {
      return call<PolicyResult>('policy', { fen, eloSelf, eloOppo })
    },
    terminate() {
      worker.terminate()
    },
  }
}
