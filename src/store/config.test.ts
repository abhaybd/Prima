import { afterEach, describe, expect, it } from 'vitest'
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from '../types/config'
import { loadConfig, mergeConfig, saveConfig } from './config'

describe('config persistence', () => {
  afterEach(() => {
    globalThis.localStorage?.removeItem(CONFIG_STORAGE_KEY)
  })

  it('returns defaults when empty', () => {
    const memory = new Map<string, string>()
    const ls = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v)
      },
      removeItem: (k: string) => {
        memory.delete(k)
      },
    }
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
    expect(loadConfig().tauRatio).toBe(DEFAULT_CONFIG.tauRatio)
    expect(loadConfig().opponentElo).toBe(1000)
    expect(loadConfig().timeControl).toEqual({ initial: 180, increment: 0 })
  })

  it('keeps unknown keys from wiping defaults', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { tauRatio: 0.4 } as Partial<typeof DEFAULT_CONFIG>)
    expect(merged.tauRatio).toBe(0.4)
    expect(merged.thresholdElo).toBe(2000)
  })

  it('drops the old openingSkipPlies setting', () => {
    const memory = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
      },
      configurable: true,
    })
    memory.set(
      CONFIG_STORAGE_KEY,
      JSON.stringify({ configVersion: 2, openingSkipPlies: 12, opponentElo: 1800 }),
    )
    expect(loadConfig()).not.toHaveProperty('openingSkipPlies')
    expect(loadConfig().opponentElo).toBe(1800)
  })

  it('accepts grace freeze clock mode', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { freezeClockMode: 'grace', freezeGraceSeconds: 3 })
    expect(merged.freezeClockMode).toBe('grace')
    expect(merged.freezeGraceSeconds).toBe(3)
  })

  it('round-trips through save/load', () => {
    const memory = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
      },
      configurable: true,
    })
    saveConfig({ ...DEFAULT_CONFIG, opponentElo: 1800, timeControl: { initial: 60, increment: 1 } })
    expect(loadConfig().opponentElo).toBe(1800)
    expect(loadConfig().timeControl.increment).toBe(1)
  })

  it('migrates the old 1500 opponent Elo default to 1000', () => {
    const memory = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
      },
      configurable: true,
    })
    memory.set(
      CONFIG_STORAGE_KEY,
      JSON.stringify({ opponentElo: 1500, thresholdElo: 2000, timeControl: { initial: 180, increment: 0 } }),
    )
    expect(loadConfig().opponentElo).toBe(1000)
    expect(loadConfig().configVersion).toBe(3)
  })

  it('drops the old Stockfish WDL settings', () => {
    const memory = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
      },
      configurable: true,
    })
    memory.set(
      CONFIG_STORAGE_KEY,
      JSON.stringify({
        configVersion: 2,
        tauWdl: 0.12,
        wdlClauseEnabled: true,
        sfMovetimeMs: 80,
        opponentElo: 1800,
      }),
    )
    expect(loadConfig()).not.toHaveProperty('tauWdl')
    expect(loadConfig()).not.toHaveProperty('wdlClauseEnabled')
    expect(loadConfig()).not.toHaveProperty('sfMovetimeMs')
    expect(loadConfig().opponentElo).toBe(1800)
    expect(loadConfig().configVersion).toBe(3)
  })
})
