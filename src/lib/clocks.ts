import type { Color } from '../types/config'

export interface ClockState {
  w: number
  b: number
  running: Color | null
  lastTick: number
}

export function createClocks(initialSeconds: number, now: number): ClockState {
  const ms = initialSeconds * 1000
  return { w: ms, b: ms, running: 'w', lastTick: now }
}

export function tickClocks(clocks: ClockState, now: number): { clocks: ClockState; flagged: Color | null } {
  if (!clocks.running) return { clocks, flagged: null }
  const elapsed = Math.max(0, now - clocks.lastTick)
  const next = { ...clocks, lastTick: now }
  next[clocks.running] = clocks[clocks.running] - elapsed
  if (next[clocks.running] <= 0) {
    next[clocks.running] = 0
    const flagged = clocks.running
    next.running = null
    return { clocks: next, flagged }
  }
  return { clocks: next, flagged: null }
}

export function pauseClocks(clocks: ClockState, now: number): ClockState {
  const { clocks: ticked } = tickClocks(clocks, now)
  return { ...ticked, running: null }
}

export function resumeClocks(clocks: ClockState, color: Color, now: number): ClockState {
  return { ...clocks, running: color, lastTick: now }
}

export function applyIncrement(clocks: ClockState, color: Color, incrementSeconds: number): ClockState {
  if (incrementSeconds <= 0) return clocks
  return { ...clocks, [color]: clocks[color] + incrementSeconds * 1000 }
}

export function deductMs(clocks: ClockState, color: Color, ms: number): { clocks: ClockState; flagged: Color | null } {
  const next = { ...clocks, [color]: clocks[color] - ms }
  if (next[color] <= 0) {
    next[color] = 0
    next.running = null
    return { clocks: next, flagged: color }
  }
  return { clocks: next, flagged: null }
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
