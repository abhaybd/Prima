import { Chess } from 'chess.js'
import { legalUcis } from '../chess'
import { mirrorMove, MOVE_INDEX, MOVE_VOCAB } from './moves'

export interface LegalPolicy {
  uci: string
  p: number
  logit: number
}

export function softmax(logits: number[]): number[] {
  const max = Math.max(...logits)
  const exps = logits.map((v) => Math.exp(v - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((v) => v / sum)
}

/**
 * Map 4352 logits onto legal UCIs in the real (unmirrored) position.
 * Illegal logits are dropped; probabilities are renormalized over legal moves.
 */
export function decodePolicy(fen: string, logits: Float32Array | number[]): LegalPolicy[] {
  const chess = new Chess(fen)
  const black = chess.turn() === 'b'
  const legal = legalUcis(chess)
  const entries: { uci: string; logit: number }[] = []

  for (const uci of legal) {
    const modelUci = black ? mirrorMove(uci) : uci
    const index = MOVE_INDEX[modelUci]
    if (index === undefined) continue
    entries.push({ uci, logit: Number(logits[index]) })
  }

  if (entries.length === 0) return []
  const probs = softmax(entries.map((e) => e.logit))
  return entries.map((e, i) => ({ uci: e.uci, logit: e.logit, p: probs[i] }))
}

export function sampleMove(policy: LegalPolicy[], random: () => number = Math.random): string {
  if (policy.length === 0) throw new Error('No legal moves to sample')
  let r = random()
  for (const move of policy) {
    r -= move.p
    if (r <= 0) return move.uci
  }
  return policy[policy.length - 1].uci
}

export function topMove(policy: LegalPolicy[]): LegalPolicy | undefined {
  if (policy.length === 0) return undefined
  return policy.reduce((best, cur) => (cur.p > best.p ? cur : best))
}

export function moveProb(policy: LegalPolicy[], uci: string): number {
  return policy.find((m) => m.uci === uci)?.p ?? 0
}

export function vocabSize(): number {
  return MOVE_VOCAB.length
}
