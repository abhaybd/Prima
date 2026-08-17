import { Chess } from 'chess.js'
import { legalUcis } from '../chess'
import type { OpponentSampleMode } from '../../types/config'
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

/** Opponent nucleus (CSSLab UCI `TopP`). 1.0 keeps hanging-piece tail mass. */
export const OPPONENT_TOP_P = 0.9

/** Keep the p-sorted prefix whose cumulative mass is ≤ `topP` (always at least the top move). */
export function nucleusPolicy(policy: LegalPolicy[], topP: number): LegalPolicy[] {
  if (policy.length === 0 || topP >= 1) return policy
  const sorted = [...policy].sort((a, b) => b.p - a.p)
  const kept: LegalPolicy[] = []
  let cum = 0
  for (let i = 0; i < sorted.length; i++) {
    cum += sorted[i].p
    if (i === 0 || cum <= topP) kept.push(sorted[i])
    else break
  }
  const sum = kept.reduce((s, m) => s + m.p, 0)
  if (sum <= 0) return kept
  return kept.map((m) => ({ ...m, p: m.p / sum }))
}

export function sampleMove(
  policy: LegalPolicy[],
  random: () => number = Math.random,
  topP: number = OPPONENT_TOP_P,
): string {
  if (policy.length === 0) throw new Error('No legal moves to sample')
  const dist = nucleusPolicy(policy, topP)
  let r = random()
  for (const move of dist) {
    r -= move.p
    if (r <= 0) return move.uci
  }
  return dist[dist.length - 1].uci
}

export function chooseOpponentMove(
  policy: LegalPolicy[],
  mode: OpponentSampleMode,
  topP: number = OPPONENT_TOP_P,
  random: () => number = Math.random,
): string {
  if (mode === 'argmax') {
    const top = topMove(policy)
    if (!top) throw new Error('No legal moves to sample')
    return top.uci
  }
  return sampleMove(policy, random, topP)
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
