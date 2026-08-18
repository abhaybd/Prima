import * as ort from 'onnxruntime-web/wasm'
import { decodePolicy } from '../lib/maia/decode'
import { ortWasmPaths } from '../lib/maia/ortAssets'
import { tokenizeBoard } from '../lib/maia/tokenize'
import type { RpcRequest, RpcResponse } from '../engine/rpc'

let session: ort.InferenceSession | null = null

function reply(id: number, result?: unknown, error?: string): void {
  const msg: RpcResponse = { id, result, error }
  self.postMessage(msg)
}

function configureOrt(): void {
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  ort.env.wasm.wasmPaths = ortWasmPaths
}

async function load(buffer: ArrayBuffer): Promise<void> {
  configureOrt()
  session = await ort.InferenceSession.create(buffer, {
    graphOptimizationLevel: 'basic',
    executionProviders: ['wasm'],
  })
}

async function policy(fen: string, eloSelf: number, eloOppo: number) {
  if (!session) throw new Error('Maia session not loaded')
  const tokens = tokenizeBoard(fen)
  const feeds: Record<string, ort.Tensor> = {
    tokens: new ort.Tensor('float32', tokens, [1, 64, 12]),
    elo_self: new ort.Tensor('float32', Float32Array.from([eloSelf]), [1]),
    elo_oppo: new ort.Tensor('float32', Float32Array.from([eloOppo]), [1]),
  }
  const out = await session.run(feeds)
  const logitsTensor = out.logits_move ?? Object.values(out)[0]
  const logits = logitsTensor.data as Float32Array
  return { policy: decodePolicy(fen, logits) }
}

self.onmessage = async (event: MessageEvent<RpcRequest>) => {
  const { id, method, args } = event.data
  try {
    if (method === 'load') {
      const { buffer } = args as { buffer: ArrayBuffer }
      await load(buffer)
      reply(id, { ok: true })
    } else if (method === 'policy') {
      const { fen, eloSelf, eloOppo } = args as {
        fen: string
        eloSelf: number
        eloOppo: number
      }
      reply(id, await policy(fen, eloSelf, eloOppo))
    } else {
      reply(id, undefined, `Unknown method ${method}`)
    }
  } catch (err) {
    reply(id, undefined, err instanceof Error ? err.message : String(err))
  }
}
