import { parseBestMove } from '../lib/wdl'
import { evalFromInfoLines, sideToMoveFromFen } from '../lib/sfEval'
import type { SfEval } from '../types/game'

export const SF_MOVETIME_MS = 100
const SF_WORKER_URL = `${import.meta.env.BASE_URL}engines/stockfish-18-lite-single.js`

export interface SfEvaluation extends SfEval {
  bestMove: string
}

export interface StockfishClient {
  evaluate(fen: string, movetimeMs?: number): Promise<SfEvaluation>
  terminate(): void
}

export function createStockfishClient(): StockfishClient {
  const worker = new Worker(SF_WORKER_URL)
  let ready: Promise<void> | null = null
  let chain: Promise<unknown> = Promise.resolve()

  function send(cmd: string): void {
    worker.postMessage(cmd)
  }

  function waitFor(predicate: (line: string) => boolean, timeoutMs = 20000): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const lines: string[] = []
      const timer = setTimeout(() => {
        worker.removeEventListener('message', onMessage)
        reject(new Error('Stockfish timeout'))
      }, timeoutMs)
      const onMessage = (event: MessageEvent<string>) => {
        const line = String(event.data)
        lines.push(line)
        if (predicate(line)) {
          clearTimeout(timer)
          worker.removeEventListener('message', onMessage)
          resolve(lines)
        }
      }
      worker.addEventListener('message', onMessage)
    })
  }

  function init(): Promise<void> {
    if (!ready) {
      ready = (async () => {
        send('uci')
        await waitFor((l) => l.trim() === 'uciok')
        send('setoption name Hash value 16')
        send('isready')
        await waitFor((l) => l.trim() === 'readyok')
      })()
    }
    return ready
  }

  async function evaluate(fen: string, movetimeMs = SF_MOVETIME_MS): Promise<SfEvaluation> {
    const run = async (): Promise<SfEvaluation> => {
      await init()
      send(`position fen ${fen}`)
      send(`go movetime ${movetimeMs}`)
      const lines = await waitFor((l) => l.startsWith('bestmove'), Math.max(5000, movetimeMs + 4000))
      const score = evalFromInfoLines(lines, sideToMoveFromFen(fen))
      const bestMove = parseBestMove(lines[lines.length - 1] ?? '') ?? ''
      return { bestMove, ...score }
    }

    const next = chain.then(run, run)
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  return {
    evaluate,
    terminate() {
      worker.terminate()
    },
  }
}
