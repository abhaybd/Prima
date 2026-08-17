import { afterEach, describe, expect, it } from 'vitest'
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from '../types/config'
import { clearConfig, loadConfig, mergeConfig, saveConfig } from './config'

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
    expect(loadConfig().opponentSampleMode).toBe('nucleus')
    expect(loadConfig().opponentTopP).toBe(0.9)
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

  it('accepts opponent sampling mode and nucleus p', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      opponentSampleMode: 'argmax',
      opponentTopP: 0.8,
    })
    expect(merged.opponentSampleMode).toBe('argmax')
    expect(merged.opponentTopP).toBe(0.8)
  })

  it('defaults sampling when the stored config predates it', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { opponentElo: 1800 } as Partial<typeof DEFAULT_CONFIG>)
    expect(merged.opponentSampleMode).toBe('nucleus')
    expect(merged.opponentTopP).toBe(0.9)
  })

  it('rejects an invalid sampling mode and clamps nucleus p', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      opponentSampleMode: 'greedy' as never,
      opponentTopP: 1.4,
    })
    expect(merged.opponentSampleMode).toBe('nucleus')
    expect(merged.opponentTopP).toBe(1)
    expect(mergeConfig(DEFAULT_CONFIG, { opponentTopP: 0 }).opponentTopP).toBe(0.01)
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
    expect(loadConfig().configVersion).toBe(4)
  })

  it('drops the old verdictGateMs setting', () => {
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
        configVersion: 3,
        verdictGateMs: 250,
        opponentElo: 1800,
      }),
    )
    expect(loadConfig()).not.toHaveProperty('verdictGateMs')
    expect(loadConfig().opponentElo).toBe(1800)
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
    expect(loadConfig().configVersion).toBe(4)
  })

  it('clears stored config so load returns defaults', () => {
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
    clearConfig()
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })
})
